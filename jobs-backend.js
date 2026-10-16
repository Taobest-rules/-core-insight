// jobs-backend.js — Job board routes for Core Insight
// Wire up in index.js (anywhere before app.listen):
//     require('./jobs-backend')(app, db);

module.exports = function registerJobRoutes(app, db) {
  const rows = (r) => {
    if (!r) return [];
    if (Array.isArray(r) && r.length === 2 && Array.isArray(r[0])) return r[0];
    if (Array.isArray(r)) return r;
    return [r];
  };
  const insertId = (r) => (r && r.insertId) || (Array.isArray(r) && r[0] && r[0].insertId) || null;

  // ---------- Migrations ----------
  (async () => {
    const run = async (sql, label) => {
      try { await db.query(sql); console.log(`✅ Jobs migration: ${label}`); }
      catch (e) { if (!/duplicate|already exists/i.test(e.message)) console.error(`❌ Jobs migration failed (${label}):`, e.message); }
    };
    await run(
      `CREATE TABLE IF NOT EXISTS jobs (
        id INT AUTO_INCREMENT PRIMARY KEY,
        client_id INT NOT NULL,
        title VARCHAR(255) NOT NULL,
        category VARCHAR(100) NOT NULL,
        subcategory VARCHAR(100) NULL,
        description TEXT NOT NULL,
        budget_min DECIMAL(10,2) NULL,
        budget_max DECIMAL(10,2) NULL,
        location VARCHAR(255) NULL,
        qualifications TEXT NULL,
        status VARCHAR(20) DEFAULT 'open',
        awarded_bid_id INT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_status (status),
        INDEX idx_client (client_id),
        INDEX idx_category (category)
      )`, 'jobs table');
    await run(
      `CREATE TABLE IF NOT EXISTS job_bids (
        id INT AUTO_INCREMENT PRIMARY KEY,
        job_id INT NOT NULL,
        provider_id INT NOT NULL,
        amount DECIMAL(10,2) NOT NULL,
        note TEXT NULL,
        status VARCHAR(20) DEFAULT 'pending',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uniq_job_provider (job_id, provider_id),
        INDEX idx_job (job_id)
      )`, 'job_bids table');
  })();

  // ---------- Post a job ----------
  app.post('/api/jobs', async (req, res) => {
    try {
      const user = req.session.user;
      if (!user) return res.status(401).json({ error: 'Please log in to post a job' });

      const { title, category, subcategory, description, budget_min, budget_max, location, qualifications } = req.body;
      if (!title || !title.trim() || !category || !description || !description.trim()) {
        return res.status(400).json({ error: 'Title, category and description are required' });
      }
      if (title.trim().length > 255) return res.status(400).json({ error: 'Title is too long' });

      const min = budget_min !== null && budget_min !== '' && budget_min !== undefined ? parseFloat(budget_min) : null;
      const max = budget_max !== null && budget_max !== '' && budget_max !== undefined ? parseFloat(budget_max) : null;
      if ((min !== null && (isNaN(min) || min < 0)) || (max !== null && (isNaN(max) || max < 0))) {
        return res.status(400).json({ error: 'Budget must be a positive number' });
      }
      if (min !== null && max !== null && min > max) {
        return res.status(400).json({ error: 'Minimum budget cannot exceed maximum' });
      }

      const result = await db.query(
        `INSERT INTO jobs (client_id, title, category, subcategory, description, budget_min, budget_max, location, qualifications, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', NOW())`,
        [user.id, title.trim(), category, subcategory || null, description.trim(), min, max,
         location ? location.trim() : null, qualifications ? qualifications.trim() : null]
      );
      res.status(201).json({ success: true, job_id: insertId(result) });
    } catch (err) {
      console.error('Post job error:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // ---------- List jobs ----------
  app.get('/api/jobs', async (req, res) => {
    try {
      const { status, category, mine } = req.query;
      let sql = `
        SELECT j.*, u.username AS client_name,
               (SELECT COUNT(*) FROM job_bids b WHERE b.job_id = j.id) AS bid_count
        FROM jobs j
        LEFT JOIN users u ON j.client_id = u.id
        WHERE 1=1`;
      const params = [];
      if (status) { sql += ' AND j.status = ?'; params.push(status); }
      if (category) { sql += ' AND j.category = ?'; params.push(category); }
      if (mine === '1' && req.session.user) { sql += ' AND j.client_id = ?'; params.push(req.session.user.id); }
      sql += ' ORDER BY j.created_at DESC LIMIT 100';

      const list = rows(await db.query(sql, params)).map(j => ({ ...j, bid_count: Number(j.bid_count) || 0 }));
      res.json(list);
    } catch (err) {
      console.error('List jobs error:', err);
      res.json([]); // frontend expects an array
    }
  });

  // ---------- Single job ----------
  app.get('/api/jobs/:id', async (req, res) => {
    try {
      const job = rows(await db.query(
        `SELECT j.*, u.username AS client_name,
                (SELECT COUNT(*) FROM job_bids b WHERE b.job_id = j.id) AS bid_count
         FROM jobs j LEFT JOIN users u ON j.client_id = u.id WHERE j.id = ?`, [req.params.id]))[0];
      if (!job) return res.status(404).json({ error: 'Job not found' });
      res.json(job);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // ---------- Submit / update a bid ----------
  app.post('/api/jobs/:id/bids', async (req, res) => {
    try {
      const user = req.session.user;
      if (!user) return res.status(401).json({ error: 'Please log in to bid' });
      if (user.role !== 'freelancer' && user.role !== 'admin') {
        return res.status(403).json({ error: 'Only freelancers can submit bids' });
      }

      const job = rows(await db.query('SELECT * FROM jobs WHERE id = ?', [req.params.id]))[0];
      if (!job) return res.status(404).json({ error: 'Job not found' });
      if (job.status !== 'open') return res.status(400).json({ error: 'This job is no longer accepting bids' });
      if (parseInt(job.client_id) === parseInt(user.id)) return res.status(400).json({ error: "You can't bid on your own job" });

      const amount = parseFloat(req.body.amount);
      if (isNaN(amount) || amount <= 0) return res.status(400).json({ error: 'Enter a valid bid amount' });
      const note = (req.body.note || '').trim().substring(0, 2000);

      await db.query(
        `INSERT INTO job_bids (job_id, provider_id, amount, note, status, created_at)
         VALUES (?, ?, ?, ?, 'pending', NOW())
         ON DUPLICATE KEY UPDATE amount = VALUES(amount), note = VALUES(note), status = 'pending'`,
        [job.id, user.id, amount, note || null]
      );

      // Let the job owner know (uses the existing notifications table)
      try {
        await db.query(
          `INSERT INTO notifications (recipient_id, type, title, message, link, created_at)
           VALUES (?, 'bid', ?, ?, '/services.html', NOW())`,
          [job.client_id, `New bid on "${job.title}"`, `${user.username} bid $${amount.toFixed(2)}`]
        );
      } catch (e) { /* notifications are best-effort */ }

      res.status(201).json({ success: true });
    } catch (err) {
      console.error('Submit bid error:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // ---------- View bids (job owner only) ----------
  app.get('/api/jobs/:id/bids', async (req, res) => {
    try {
      const user = req.session.user;
      if (!user) return res.status(401).json({ error: 'Please log in' });
      const job = rows(await db.query('SELECT client_id FROM jobs WHERE id = ?', [req.params.id]))[0];
      if (!job) return res.status(404).json({ error: 'Job not found' });
      if (parseInt(job.client_id) !== parseInt(user.id) && user.role !== 'admin') {
        return res.status(403).json({ error: 'Only the job owner can view bids' });
      }
      const bids = rows(await db.query(
        `SELECT b.*, u.username AS provider_name, fp.headline, fp.profile_picture_url
         FROM job_bids b
         JOIN users u ON b.provider_id = u.id
         LEFT JOIN freelancer_profiles fp ON fp.user_id = b.provider_id
         WHERE b.job_id = ? ORDER BY b.amount ASC`, [req.params.id]));
      res.json(bids);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // ---------- Accept a bid ----------
  app.post('/api/jobs/:id/bids/:bidId/accept', async (req, res) => {
    try {
      const user = req.session.user;
      if (!user) return res.status(401).json({ error: 'Please log in' });
      const job = rows(await db.query('SELECT * FROM jobs WHERE id = ?', [req.params.id]))[0];
      if (!job) return res.status(404).json({ error: 'Job not found' });
      if (parseInt(job.client_id) !== parseInt(user.id)) return res.status(403).json({ error: 'Only the job owner can accept a bid' });
      if (job.status !== 'open') return res.status(400).json({ error: 'Job is no longer open' });

      const bid = rows(await db.query('SELECT * FROM job_bids WHERE id = ? AND job_id = ?', [req.params.bidId, job.id]))[0];
      if (!bid) return res.status(404).json({ error: 'Bid not found' });

      await db.query(`UPDATE job_bids SET status = 'accepted' WHERE id = ?`, [bid.id]);
      await db.query(`UPDATE job_bids SET status = 'rejected' WHERE job_id = ? AND id != ?`, [job.id, bid.id]);
      await db.query(`UPDATE jobs SET status = 'awarded', awarded_bid_id = ? WHERE id = ?`, [bid.id, job.id]);

      res.json({ success: true, provider_id: bid.provider_id, amount: bid.amount });
    } catch (err) {
      console.error('Accept bid error:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // ---------- Close a job ----------
  app.post('/api/jobs/:id/close', async (req, res) => {
    try {
      const user = req.session.user;
      if (!user) return res.status(401).json({ error: 'Please log in' });
      const job = rows(await db.query('SELECT client_id FROM jobs WHERE id = ?', [req.params.id]))[0];
      if (!job) return res.status(404).json({ error: 'Job not found' });
      if (parseInt(job.client_id) !== parseInt(user.id) && user.role !== 'admin') {
        return res.status(403).json({ error: 'Not allowed' });
      }
      await db.query(`UPDATE jobs SET status = 'closed' WHERE id = ?`, [req.params.id]);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
};