// services-backend.js
// Services API with subcategory + pricing_type support.
//
// Mount it in index.js directly under the jobs-backend line:
//     require('./jobs-backend')(app, db);
//     require('./services-backend')(app, db);
// Express uses the first matching route, so these replace the old
// /api/services handlers in index.js without you having to delete them.

module.exports = function (app, db) {
  const extractRows = (r) => {
    if (!r) return [];
    if (Array.isArray(r) && r.length === 2 && Array.isArray(r[0])) return r[0];
    if (Array.isArray(r)) return r;
    return [r];
  };
  const insertIdOf = (r) => r?.insertId || r?.[0]?.insertId || null;
  const parseJSON = (v, fallback) => {
    if (v == null || v === '') return fallback;
    if (typeof v !== 'string') return v;
    try { return JSON.parse(v); } catch (e) { return fallback; }
  };

  // Set REQUIRE_SELLER_VERIFICATION=true in your env to bring back the
  // identity-verification gate. Off by default so new freelancers can list.
  const REQUIRE_VERIFICATION = process.env.REQUIRE_SELLER_VERIFICATION === 'true';

  /* ---------- migrations ---------- */
  (async () => {
    for (const sql of [
      `ALTER TABLE services ADD COLUMN subcategory VARCHAR(120) NULL`,
      `ALTER TABLE services ADD COLUMN pricing_type VARCHAR(20) DEFAULT 'fixed'`,
    ]) {
      try { await db.query(sql); }
      catch (e) { if (!/duplicate|already exists/i.test(e.message)) console.error('Services migration failed:', e.message); }
    }
  })();

  /* ---------- LIST (public) ---------- */
  app.get('/api/services', async (req, res) => {
    try {
      const { category, subcategory, search, sort } = req.query;
      const limit = Math.min(parseInt(req.query.limit) || 20, 100);
      const offset = parseInt(req.query.offset) || 0;

      let where = `WHERE s.status = 'active'`;
      const params = [];
      if (category) { where += ' AND s.category = ?'; params.push(category); }
      if (subcategory) { where += ' AND s.subcategory = ?'; params.push(subcategory); }
      if (search) {
        where += ' AND (s.title LIKE ? OR s.description LIKE ? OR s.subcategory LIKE ?)';
        params.push(`%${search}%`, `%${search}%`, `%${search}%`);
      }

      const orderBy = {
        price_low: 's.price ASC',
        price_high: 's.price DESC',
        rating: 'avg_rating DESC',
      }[sort] || 's.created_at DESC';

      const services = extractRows(await db.query(`
        SELECT s.*, u.username, u.id AS user_id,
               fp.profile_picture_url AS profile_picture_url,
               fp.headline AS provider_headline,
               (SELECT AVG(rating) FROM service_reviews WHERE service_id = s.id) AS avg_rating,
               (SELECT COUNT(*) FROM service_reviews WHERE service_id = s.id) AS review_count,
               (SELECT COUNT(*) FROM service_favorites WHERE service_id = s.id) AS favorite_count
        FROM services s
        LEFT JOIN users u ON s.user_id = u.id
        LEFT JOIN freelancer_profiles fp ON fp.user_id = s.user_id
        ${where}
        ORDER BY ${orderBy}
        LIMIT ${limit} OFFSET ${offset}`, params));

      const countRows = extractRows(await db.query(`SELECT COUNT(*) AS total FROM services s ${where}`, params));
      const total = Number(countRows[0]?.total || 0);

      let out = services;
      if (req.session.user && services.length) {
        try {
          const favs = extractRows(await db.query('SELECT service_id FROM service_favorites WHERE user_id = ?', [req.session.user.id]));
          const ids = new Set(favs.map(f => f.service_id));
          out = services.map(s => ({ ...s, is_favorited: ids.has(s.id) }));
        } catch (e) { console.error('Favorites flag error:', e.message); }
      }

      res.json({ services: out, pagination: { total, limit, offset, has_more: total > offset + limit } });
    } catch (err) {
      console.error('Services fetch error:', err);
      res.status(200).json({ services: [], pagination: { total: 0, limit: 20, offset: 0, has_more: false } });
    }
  });

  /* ---------- MY SERVICES (freelancer) ---------- */
  app.get('/api/services/my-services', async (req, res) => {
    try {
      if (!req.session.user) return res.status(401).json({ error: 'Please login to view your services' });

      const rows = extractRows(await db.query(`
        SELECT s.*, u.username,
               fp.profile_picture_url AS profile_picture,
               fp.headline AS provider_headline,
               (SELECT COUNT(*) FROM service_orders WHERE service_id = s.id) AS total_orders,
               (SELECT COUNT(*) FROM service_reviews WHERE service_id = s.id) AS review_count,
               (SELECT AVG(rating) FROM service_reviews WHERE service_id = s.id) AS avg_rating,
               (SELECT COALESCE(SUM(provider_earnings), 0) FROM service_orders WHERE service_id = s.id AND status = 'completed') AS total_earnings,
               (SELECT COUNT(*) FROM service_favorites WHERE service_id = s.id) AS favorite_count
        FROM services s
        LEFT JOIN users u ON s.user_id = u.id
        LEFT JOIN freelancer_profiles fp ON fp.user_id = s.user_id
        WHERE s.user_id = ?
        ORDER BY s.created_at DESC`, [req.session.user.id]));

      res.json(rows.map(s => ({
        ...s,
        tags: parseJSON(s.tags, []),
        requirements: parseJSON(s.requirements, []),
      })));
    } catch (err) {
      console.error('Error fetching your services:', err);
      res.status(500).json({ error: 'Error fetching your services', details: err.message });
    }
  });

  /* ---------- FAVORITES LIST (was shadowed by /:id before) ---------- */
  app.get('/api/services/favorites', async (req, res) => {
    if (!req.session.user) return res.json([]);
    try {
      const rows = extractRows(await db.query(`
        SELECT s.*, u.username
        FROM service_favorites sf
        JOIN services s ON sf.service_id = s.id
        JOIN users u ON s.user_id = u.id
        WHERE sf.user_id = ?
        ORDER BY sf.created_at DESC`, [req.session.user.id]));
      res.json(rows);
    } catch (err) {
      console.error('Error fetching favorites:', err);
      res.json([]);
    }
  });

  /* ---------- CATEGORIES (those currently in use) ---------- */
  app.get('/api/services/categories', async (req, res) => {
    try {
      const rows = extractRows(await db.query(`
        SELECT DISTINCT category FROM services
        WHERE category IS NOT NULL AND category != '' AND status = 'active'
        ORDER BY category`));
      res.json(rows.map(r => r.category).filter(Boolean));
    } catch (err) {
      console.error('Error fetching categories:', err);
      res.status(500).json({ error: 'Error fetching categories' });
    }
  });

  /* ---------- DETAILS ---------- */
  app.get('/api/services/:id', async (req, res) => {
    try {
      const serviceId = req.params.id;
      const rows = extractRows(await db.query(`
        SELECT s.*, u.username, u.id AS user_id, u.created_at AS user_since,
               fp.profile_picture_url AS provider_profile_picture,
               fp.headline AS provider_headline,
               fp.description AS provider_description,
               fp.hourly_rate AS provider_hourly_rate,
               fp.skills, fp.location, fp.completed_orders,
               (SELECT AVG(rating) FROM service_reviews WHERE service_id = s.id) AS avg_rating,
               (SELECT COUNT(*) FROM service_reviews WHERE service_id = s.id) AS review_count,
               (SELECT COUNT(*) FROM service_favorites WHERE service_id = s.id) AS favorite_count
        FROM services s
        LEFT JOIN users u ON s.user_id = u.id
        LEFT JOIN freelancer_profiles fp ON fp.user_id = s.user_id
        WHERE s.id = ? AND s.status = 'active'`, [serviceId]));

      const service = rows[0];
      if (!service) return res.status(404).json({ error: 'Service not found' });

      const packages = extractRows(await db.query(
        'SELECT * FROM service_packages WHERE service_id = ? AND is_active = 1', [serviceId]))
        .map(p => ({ ...p, features: parseJSON(p.features, []) }));

      const reviews = extractRows(await db.query(`
        SELECT sr.*, u.username FROM service_reviews sr
        JOIN users u ON sr.user_id = u.id
        WHERE sr.service_id = ?
        ORDER BY sr.created_at DESC LIMIT 10`, [serviceId]));

      res.json({
        ...service,
        packages,
        reviews,
        review_count: Number(service.review_count) || reviews.length,
        avg_rating: service.avg_rating || 0,
        requirements: parseJSON(service.requirements, service.requirements ? [service.requirements] : []),
        tags: parseJSON(service.tags, service.tags ? [service.tags] : []),
      });
    } catch (err) {
      console.error('Error loading service details:', err);
      res.status(500).json({ error: 'Error loading service details: ' + err.message });
    }
  });

  /* ---------- CREATE ---------- */
  app.post('/api/services', async (req, res) => {
    if (!req.session.user) return res.status(401).json({ error: 'Please login to create a service' });
    if (req.session.user.role !== 'freelancer' && req.session.user.role !== 'admin') {
      return res.status(403).json({ error: 'Only freelancers can create services' });
    }

    try {
      let serviceStatus = 'active';
      let isDraft = false;
      let message = 'Service created successfully!';
      let verificationStatus = null;

      if (REQUIRE_VERIFICATION && req.session.user.role === 'freelancer') {
        const v = extractRows(await db.query('SELECT verification_status FROM users WHERE id = ?', [req.session.user.id]));
        verificationStatus = v[0]?.verification_status;
        if (verificationStatus === 'unverified') {
          return res.status(403).json({
            error: 'Please complete identity verification before creating services',
            verification_required: true,
            redirect_url: '/verification.html',
          });
        }
        if (verificationStatus === 'pending_review') {
          serviceStatus = 'draft';
          isDraft = true;
          message = 'Service saved as draft. It will become active once your verification is complete (within 2 hours).';
        }
      }

      const {
        title, description, category, subcategory, pricing_type,
        hourly_rate, fixed_price, delivery_time, revisions, tags, requirements,
      } = req.body;

      if (!title || !description) return res.status(400).json({ error: 'Title and description are required' });
      if (String(title).trim().length < 5) return res.status(400).json({ error: 'Title must be at least 5 characters' });
      if (String(description).trim().length < 20) return res.status(400).json({ error: 'Description must be at least 20 characters' });
      if (!category) return res.status(400).json({ error: 'Category is required' });

      const pricingType = pricing_type === 'flexible' ? 'flexible' : 'fixed';
      const fixed = parseFloat(fixed_price);
      const hourly = parseFloat(hourly_rate);
      const price = fixed > 0 ? fixed : (hourly > 0 ? hourly : 0);

      if (pricingType === 'fixed' && !(fixed > 0)) {
        return res.status(400).json({ error: 'A fixed price is required for fixed-price services' });
      }

      const profileRows = extractRows(await db.query(
        'SELECT profile_picture_url FROM freelancer_profiles WHERE user_id = ?', [req.session.user.id]));
      const profilePicture = profileRows[0]?.profile_picture_url || null;

      let parsedTags = parseJSON(tags, null);
      if (parsedTags == null && typeof tags === 'string') parsedTags = tags.split(',').map(t => t.trim()).filter(Boolean);
      let parsedReqs = parseJSON(requirements, null);
      if (parsedReqs == null && typeof requirements === 'string') parsedReqs = requirements.split('\n').map(r => r.trim()).filter(Boolean);

      const insert = await db.query(`
        INSERT INTO services
          (user_id, title, description, price, category, subcategory, pricing_type,
           provider_profile_picture, delivery_time, revisions, tags, requirements,
           status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`, [
        req.session.user.id,
        String(title).trim(),
        String(description).trim(),
        price,
        String(category).trim(),
        subcategory ? String(subcategory).trim().slice(0, 120) : null,
        pricingType,
        profilePicture,
        parseInt(delivery_time) || 7,
        parseInt(revisions) || 2,
        parsedTags && parsedTags.length ? JSON.stringify(parsedTags) : null,
        parsedReqs && parsedReqs.length ? JSON.stringify(parsedReqs) : null,
        serviceStatus,
      ]);

      const serviceId = insertIdOf(insert);
      if (!serviceId) throw new Error('Could not get service ID after creation');

      let packages = parseJSON(req.body.packages, []);
      if (Array.isArray(packages)) {
        for (const pkg of packages) {
          await db.query(`
            INSERT INTO service_packages
              (service_id, package_name, price, delivery_time, revisions, features, is_active)
            VALUES (?, ?, ?, ?, ?, ?, 1)`, [
            serviceId,
            pkg.package_name || 'basic',
            parseFloat(pkg.price) || 0,
            parseInt(pkg.delivery_time) || parseInt(delivery_time) || 7,
            parseInt(pkg.revisions) || parseInt(revisions) || 2,
            pkg.features ? JSON.stringify(pkg.features) : null,
          ]);
        }
      }

      res.json({
        success: true,
        message,
        serviceId,
        is_draft: isDraft,
        verification_status: verificationStatus,
        will_activate_after: isDraft ? '2 hours' : null,
      });
    } catch (err) {
      console.error('Service creation error:', err);
      res.status(500).json({ error: 'Error creating service: ' + err.message });
    }
  });

  /* ---------- UPDATE ---------- */
  app.put('/api/services/:id', async (req, res) => {
    if (!req.session.user) return res.status(401).json({ error: 'Please login' });
    try {
      const serviceId = req.params.id;
      const check = extractRows(await db.query('SELECT user_id FROM services WHERE id = ?', [serviceId]));
      if (!check[0]) return res.status(404).json({ error: 'Service not found' });
      if (check[0].user_id !== req.session.user.id && req.session.user.role !== 'admin') {
        return res.status(403).json({ error: 'You can only edit your own services' });
      }

      const { title, description, price, category, subcategory, pricing_type, delivery_time, revisions } = req.body;
      const n = (v) => (v === undefined || v === '' ? null : v);

      await db.query(`
        UPDATE services SET
          title = COALESCE(?, title),
          description = COALESCE(?, description),
          price = COALESCE(?, price),
          category = COALESCE(?, category),
          subcategory = COALESCE(?, subcategory),
          pricing_type = COALESCE(?, pricing_type),
          delivery_time = COALESCE(?, delivery_time),
          revisions = COALESCE(?, revisions),
          updated_at = NOW()
        WHERE id = ?`, [
        n(title), n(description), n(price), n(category), n(subcategory),
        pricing_type ? (pricing_type === 'flexible' ? 'flexible' : 'fixed') : null,
        n(delivery_time), n(revisions), serviceId,
      ]);

      res.json({ success: true, message: 'Service updated successfully' });
    } catch (err) {
      console.error('Update error:', err);
      res.status(500).json({ error: err.message });
    }
  });

  console.log('✅ services-backend loaded');
};