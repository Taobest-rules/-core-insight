const express = require("express");
const router = express.Router();
const db = require("../db");
const fetch = require("node-fetch");

/* =====================================================
   BECOME SELLER ROUTE
===================================================== */
router.post("/become-seller", async (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({ error: "Login required" });
  }

  const { bank_code, account_number, business_name } = req.body;
  const userId = req.session.user.id;

  try {
    // 1️⃣ CREATE FLUTTERWAVE SUBACCOUNT
    const response = await fetch("https://api.flutterwave.com/v3/subaccounts", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.FLUTTERWAVE_SECRET_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        account_bank: bank_code,
        account_number,
        business_name,
        split_type: "percentage",
        split_value: 90, // Seller 90%, platform 10%
      }),
    });

    const result = await response.json();

    if (result.status !== "success") {
      return res.status(400).json({ error: "Failed to create subaccount" });
    }

    const subId = result.data.subaccount_id;

    // 2️⃣ SAVE SELLER
    await db.query(
      `
      INSERT INTO sellers 
      (user_id, bank_code, account_number, business_name, flutterwave_subaccount_id)
      VALUES (?, ?, ?, ?, ?)
      `,
      [userId, bank_code, account_number, business_name, subId]
    );

    res.json({
      success: true,
      message: "Seller profile created",
      subaccount_id: subId,
    });

  } catch (err) {
    console.error("❌ Become seller error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

/* =====================================================
   START CONVERSATION ROUTE
===================================================== */
router.post("/start", async (req, res) => {
  const { serviceId } = req.body; // Changed: now only expects serviceId
  
  if (!serviceId || !req.session.user) {
    return res.status(400).json({ error: "Missing required fields" });
  }
  
  const clientId = req.session.user.id; // Get from session
  
  try {
    // Get freelancer ID from service
    const [serviceRows] = await db.query(
      "SELECT user_id as freelancerId FROM services WHERE id = ?",
      [serviceId]
    );
    
    if (serviceRows.length === 0) {
      return res.status(404).json({ error: "Service not found" });
    }
    
    const freelancerId = serviceRows[0].freelancerId;
    
    // Rest of your existing code...
    // [existing code continues]
  } catch (err) {
    // error handling
  }
});
const express = require('express');

const db = require('../config/database');
const { authenticate } = require('../middleware/auth');
const { generateOrderCode } = require('../utils/helpers');

// ================= ORDER PHYSICAL PRODUCT =================
router.post('/api/order-product', authenticate, async (req, res) => {
  const connection = await db.getConnection();
  
  try {
    await connection.beginTransaction();
    
    const { productId, sellerId, productTitle, price, deliveryType } = req.body;
    const buyerId = req.user.id;
    
    // Validate required fields
    if (!productId || !sellerId || !productTitle || price === undefined) {
      await connection.rollback();
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: productId, sellerId, productTitle, price'
      });
    }
    
    // Check if product exists and is physical
    const [productRows] = await connection.execute(
      'SELECT id, title, type, user_id, delivery_type, delivery_locations, delivery_fee, payment_option FROM products WHERE id = ?',
      [productId]
    );
    
    if (productRows.length === 0) {
      await connection.rollback();
      return res.status(404).json({
        success: false,
        error: 'Product not found'
      });
    }
    
    const product = productRows[0];
    
    if (product.type !== 'physical') {
      await connection.rollback();
      return res.status(400).json({
        success: false,
        error: 'Only physical products can be ordered through this endpoint'
      });
    }
    
    // Check if buyer is not the seller
    if (buyerId == sellerId) {
      await connection.rollback();
      return res.status(400).json({
        success: false,
        error: 'You cannot order your own product'
      });
    }
    
    // Generate unique order code
    const orderCode = generateOrderCode();
    
    // Create order
    const [orderResult] = await connection.execute(
      `INSERT INTO orders (
        order_code, product_id, buyer_id, seller_id, product_title,
        price, delivery_type, payment_option, delivery_locations, delivery_fee, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        orderCode,
        productId,
        buyerId,
        sellerId,
        productTitle,
        parseFloat(price),
        deliveryType || product.delivery_type || 'pickup',
        product.payment_option || 'pay_on_delivery',
        product.delivery_locations || '',
        parseFloat(product.delivery_fee) || 0.00,
        'pending'
      ]
    );
    
    const orderId = orderResult.insertId;
    
    // Create notification for seller
    const sellerNotification = `New order #${orderCode} for "${productTitle}" from ${req.user.username || req.user.email}`;
    
    await connection.execute(
      'INSERT INTO order_notifications (order_id, user_id, type, message) VALUES (?, ?, ?, ?)',
      [orderId, sellerId, 'new_order', sellerNotification]
    );
    
    // Create notification for buyer
    const buyerNotification = `Your order #${orderCode} for "${productTitle}" has been placed. The seller will contact you soon.`;
    
    await connection.execute(
      'INSERT INTO order_notifications (order_id, user_id, type, message) VALUES (?, ?, ?, ?)',
      [orderId, buyerId, 'new_order', buyerNotification]
    );
    
    // Send initial message from system
    const systemMessage = `Order #${orderCode} has been placed. Please use this chat to coordinate delivery and payment details.`;
    
    await connection.execute(
      'INSERT INTO order_messages (order_id, sender_id, receiver_id, message) VALUES (?, ?, ?, ?)',
      [orderId, 0, sellerId, systemMessage] // sender_id 0 = system
    );
    
    await connection.execute(
      'INSERT INTO order_messages (order_id, sender_id, receiver_id, message) VALUES (?, ?, ?, ?)',
      [orderId, 0, buyerId, systemMessage]
    );
    
    await connection.commit();
    
    // In a real application, you would:
    // 1. Send email notification to seller
    // 2. Send email notification to buyer
    // 3. Send SMS notification if configured
    // 4. Send push notification if mobile app exists
    
    res.json({
      success: true,
      message: 'Order placed successfully! The seller has been notified.',
      order: {
        id: orderId,
        order_code: orderCode,
        product_title: productTitle,
        price: price,
        delivery_type: deliveryType || product.delivery_type,
        status: 'pending'
      }
    });
    
  } catch (error) {
    await connection.rollback();
    console.error('Order creation error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to place order. Please try again.'
    });
  } finally {
    connection.release();
  }
});
// routes/orderRoutes.js
const express = require('express');

const db = require('../db');

// ========================= ORDER ROUTES =========================

// Create new physical product order
router.post('/create', async (req, res) => {
  try {
    const {
      product_name,
      product_type,
      quantity,
      price,
      customer_name,
      customer_email,
      customer_phone,
      shipping_address,
      city,
      state,
      country,
      postal_code,
      payment_method,
      shipping_method,
      shipping_cost,
      notes
    } = req.body;

    // Validation
    if (!product_name || !price || !customer_name || !customer_email || !shipping_address) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields'
      });
    }

    const qty = quantity || 1;
    const total_amount = (parseFloat(price) * qty) + (parseFloat(shipping_cost) || 0);

    const [result] = await db.query(
      `INSERT INTO physical_orders (
        product_name, product_type, quantity, price, total_amount,
        customer_name, customer_email, customer_phone,
        shipping_address, city, state, country, postal_code,
        payment_method, shipping_method, shipping_cost, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        product_name, product_type || 'general', qty, price, total_amount,
        customer_name, customer_email, customer_phone || '',
        shipping_address, city || '', state || '', country || '', postal_code || '',
        payment_method || 'flutterwave', shipping_method || 'standard', shipping_cost || 0,
        notes || ''
      ]
    );

    // Create initial tracking entry
    await db.query(
      `INSERT INTO order_tracking (order_id, status, description)
       VALUES (?, ?, ?)`,
      [result.insertId, 'pending', 'Order received and is being processed']
    );

    res.status(201).json({
      success: true,
      message: 'Order created successfully',
      order: {
        id: result.insertId,
        total_amount,
        customer_email
      }
    });

  } catch (error) {
    console.error('❌ Create order error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create order'
    });
  }
});

// Get all orders (with filtering)
router.get('/', async (req, res) => {
  try {
    const { status, email, limit = 50, page = 1 } = req.query;
    const offset = (page - 1) * limit;
    
    let query = 'SELECT * FROM physical_orders WHERE 1=1';
    const params = [];
    
    if (status) {
      query += ' AND order_status = ?';
      params.push(status);
    }
    
    if (email) {
      query += ' AND customer_email = ?';
      params.push(email);
    }
    
    query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), parseInt(offset));
    
    const [orders] = await db.query(query, params);
    
    // Get total count for pagination
    let countQuery = 'SELECT COUNT(*) as total FROM physical_orders WHERE 1=1';
    const countParams = [];
    
    if (status) {
      countQuery += ' AND order_status = ?';
      countParams.push(status);
    }
    
    if (email) {
      countQuery += ' AND customer_email = ?';
      countParams.push(email);
    }
    
    const [countResult] = await db.query(countQuery, countParams);
    const total = countResult[0].total;
    
    res.json({
      success: true,
      orders,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / limit)
      }
    });

  } catch (error) {
    console.error('❌ Get orders error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch orders'
    });
  }
});

// Get single order by ID
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const [orders] = await db.query(
      `SELECT o.*, 
       (SELECT JSON_ARRAYAGG(JSON_OBJECT('status', status, 'description', description, 'location', location, 'estimated_delivery', estimated_delivery, 'created_at', created_at))
        FROM order_tracking t 
        WHERE t.order_id = o.id 
        ORDER BY t.created_at DESC) as tracking_history
       FROM physical_orders o 
       WHERE o.id = ?`,
      [id]
    );
    
    if (orders.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Order not found'
      });
    }
    
    const order = orders[0];
    
    // Parse tracking history if it exists
    if (order.tracking_history) {
      try {
        order.tracking_history = JSON.parse(order.tracking_history);
      } catch (e) {
        order.tracking_history = [];
      }
    } else {
      order.tracking_history = [];
    }
    
    res.json({
      success: true,
      order
    });

  } catch (error) {
    console.error('❌ Get order error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch order'
    });
  }
});

// Update order status
router.put('/:id/status', async (req, res) => {
  try {
    const { id } = req.params;
    const { status, description, location, estimated_delivery } = req.body;
    
    if (!status) {
      return res.status(400).json({
        success: false,
        error: 'Status is required'
      });
    }
    
    // Update order status
    await db.query(
      'UPDATE physical_orders SET order_status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [status, id]
    );
    
    // Add tracking entry
    if (description) {
      await db.query(
        `INSERT INTO order_tracking (order_id, status, description, location, estimated_delivery)
         VALUES (?, ?, ?, ?, ?)`,
        [id, status, description, location || null, estimated_delivery || null]
      );
    }
    
    res.json({
      success: true,
      message: 'Order status updated successfully'
    });

  } catch (error) {
    console.error('❌ Update order status error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update order status'
    });
  }
});

// Update payment status
router.put('/:id/payment', async (req, res) => {
  try {
    const { id } = req.params;
    const { payment_status, transaction_id } = req.body;
    
    if (!payment_status) {
      return res.status(400).json({
        success: false,
        error: 'Payment status is required'
      });
    }
    
    await db.query(
      'UPDATE physical_orders SET payment_status = ?, transaction_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [payment_status, transaction_id || null, id]
    );
    
    res.json({
      success: true,
      message: 'Payment status updated successfully'
    });

  } catch (error) {
    console.error('❌ Update payment status error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update payment status'
    });
  }
});

// Search orders by email or phone
router.get('/search/:query', async (req, res) => {
  try {
    const { query } = req.params;
    
    const [orders] = await db.query(
      `SELECT id, customer_name, customer_email, customer_phone, 
              product_name, total_amount, order_status, created_at
       FROM physical_orders 
       WHERE customer_email LIKE ? OR customer_phone LIKE ?
       ORDER BY created_at DESC
       LIMIT 20`,
      [`%${query}%`, `%${query}%`]
    );
    
    res.json({
      success: true,
      orders
    });

  } catch (error) {
    console.error('❌ Search orders error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to search orders'
    });
  }
});

// Get order statistics
router.get('/stats/overview', async (req, res) => {
  try {
    const [stats] = await db.query(`
      SELECT 
        COUNT(*) as total_orders,
        SUM(CASE WHEN order_status = 'pending' THEN 1 ELSE 0 END) as pending_orders,
        SUM(CASE WHEN order_status = 'processing' THEN 1 ELSE 0 END) as processing_orders,
        SUM(CASE WHEN order_status = 'shipped' THEN 1 ELSE 0 END) as shipped_orders,
        SUM(CASE WHEN order_status = 'delivered' THEN 1 ELSE 0 END) as delivered_orders,
        SUM(total_amount) as total_revenue,
        AVG(total_amount) as avg_order_value
      FROM physical_orders
      WHERE DATE(created_at) >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
    `);
    
    const [recentOrders] = await db.query(`
      SELECT id, customer_name, product_name, total_amount, order_status, created_at
      FROM physical_orders
      ORDER BY created_at DESC
      LIMIT 10
    `);
    
    res.json({
      success: true,
      stats: stats[0],
      recent_orders: recentOrders
    });

  } catch (error) {
    console.error('❌ Get order stats error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch order statistics'
    });
  }
});

module.exports = router;
// ================= GET USER ORDERS =================
router.get('/api/my-orders', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    const [orders] = await db.execute(
      `SELECT o.*, 
       p.image, 
       u_seller.username as seller_username,
       u_seller.email as seller_email,
       u_buyer.username as buyer_username
       FROM orders o
       LEFT JOIN products p ON o.product_id = p.id
       LEFT JOIN users u_seller ON o.seller_id = u_seller.id
       LEFT JOIN users u_buyer ON o.buyer_id = u_buyer.id
       WHERE o.buyer_id = ? OR o.seller_id = ?
       ORDER BY o.created_at DESC`,
      [userId, userId]
    );
    
    res.json({
      success: true,
      orders: orders
    });
    
  } catch (error) {
    console.error('Get orders error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch orders'
    });
  }
});

// ================= GET ORDER DETAILS =================
router.get('/api/orders/:orderId', authenticate, async (req, res) => {
  try {
    const { orderId } = req.params;
    const userId = req.user.id;
    
    const [orderRows] = await db.execute(
      `SELECT o.*, 
       p.image, p.description, p.category,
       u_seller.username as seller_username, u_seller.email as seller_email,
       u_buyer.username as buyer_username, u_buyer.email as buyer_email
       FROM orders o
       LEFT JOIN products p ON o.product_id = p.id
       LEFT JOIN users u_seller ON o.seller_id = u_seller.id
       LEFT JOIN users u_buyer ON o.buyer_id = u_buyer.id
       WHERE o.id = ? AND (o.buyer_id = ? OR o.seller_id = ?)`,
      [orderId, userId, userId]
    );
    
    if (orderRows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Order not found or access denied'
      });
    }
    
    const order = orderRows[0];
    
    // Get order messages
    const [messages] = await db.execute(
      `SELECT m.*, u.username as sender_username
       FROM order_messages m
       LEFT JOIN users u ON m.sender_id = u.id
       WHERE m.order_id = ?
       ORDER BY m.created_at ASC`,
      [orderId]
    );
    
    // Get notifications for this order
    const [notifications] = await db.execute(
      'SELECT * FROM order_notifications WHERE order_id = ? AND user_id = ? ORDER BY created_at DESC',
      [orderId, userId]
    );
    
    res.json({
      success: true,
      order: order,
      messages: messages,
      notifications: notifications
    });
    
  } catch (error) {
    console.error('Get order details error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch order details'
    });
  }
});

// ================= UPDATE ORDER STATUS =================
router.put('/api/orders/:orderId/status', authenticate, async (req, res) => {
  const connection = await db.getConnection();
  
  try {
    await connection.beginTransaction();
    
    const { orderId } = req.params;
    const { status, notes } = req.body;
    const userId = req.user.id;
    
    // Validate status
    const validStatuses = ['confirmed', 'shipped', 'delivered', 'cancelled'];
    if (!validStatuses.includes(status)) {
      await connection.rollback();
      return res.status(400).json({
        success: false,
        error: 'Invalid status'
      });
    }
    
    // Check if user has permission to update this order
    const [orderRows] = await connection.execute(
      'SELECT * FROM orders WHERE id = ? AND seller_id = ?',
      [orderId, userId]
    );
    
    if (orderRows.length === 0) {
      await connection.rollback();
      return res.status(403).json({
        success: false,
        error: 'You are not authorized to update this order'
      });
    }
    
    const order = orderRows[0];
    
    // Update order status
    await connection.execute(
      'UPDATE orders SET status = ?, notes = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [status, notes || order.notes, orderId]
    );
    
    // Create notification for buyer
    const statusMessages = {
      'confirmed': `Your order #${order.order_code} has been confirmed by the seller.`,
      'shipped': `Your order #${order.order_code} has been shipped.`,
      'delivered': `Your order #${order.order_code} has been delivered.`,
      'cancelled': `Your order #${order.order_code} has been cancelled by the seller.`
    };
    
    await connection.execute(
      'INSERT INTO order_notifications (order_id, user_id, type, message) VALUES (?, ?, ?, ?)',
      [orderId, order.buyer_id, status, statusMessages[status]]
    );
    
    // Add system message about status update
    const systemMessage = `Order status updated to: ${status}`;
    
    await connection.execute(
      'INSERT INTO order_messages (order_id, sender_id, receiver_id, message) VALUES (?, ?, ?, ?)',
      [orderId, 0, order.buyer_id, systemMessage]
    );
    
    await connection.commit();
    
    res.json({
      success: true,
      message: `Order status updated to ${status}`
    });
    
  } catch (error) {
    await connection.rollback();
    console.error('Update order status error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update order status'
    });
  } finally {
    connection.release();
  }
});

// ================= SEND ORDER MESSAGE =================
router.post('/api/orders/:orderId/messages', authenticate, async (req, res) => {
  try {
    const { orderId } = req.params;
    const { message } = req.body;
    const userId = req.user.id;
    
    if (!message || message.trim() === '') {
      return res.status(400).json({
        success: false,
        error: 'Message cannot be empty'
      });
    }
    
    // Get order to determine receiver
    const [orderRows] = await db.execute(
      'SELECT buyer_id, seller_id FROM orders WHERE id = ?',
      [orderId]
    );
    
    if (orderRows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Order not found'
      });
    }
    
    const order = orderRows[0];
    const receiverId = userId === order.buyer_id ? order.seller_id : order.buyer_id;
    
    // Insert message
    const [result] = await db.execute(
      'INSERT INTO order_messages (order_id, sender_id, receiver_id, message) VALUES (?, ?, ?, ?)',
      [orderId, userId, receiverId, message.trim()]
    );
    
    // Create notification for receiver
    const senderName = req.user.username || req.user.email;
    const notificationMessage = `New message from ${senderName} regarding order #${order.order_code || orderId}`;
    
    await db.execute(
      'INSERT INTO order_notifications (order_id, user_id, type, message) VALUES (?, ?, ?, ?)',
      [orderId, receiverId, 'new_order', notificationMessage]
    );
    
    res.json({
      success: true,
      message: 'Message sent successfully',
      messageId: result.insertId
    });
    
  } catch (error) {
    console.error('Send message error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to send message'
    });
  }
});

// ================= GET ORDER NOTIFICATIONS =================
router.get('/api/order-notifications', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    
    const [notifications] = await db.execute(
      `SELECT n.*, o.order_code, o.product_title 
       FROM order_notifications n
       LEFT JOIN orders o ON n.order_id = o.id
       WHERE n.user_id = ?
       ORDER BY n.created_at DESC
       LIMIT 50`,
      [userId]
    );
    
    // Mark notifications as read if requested
    if (req.query.markRead === 'true') {
      await db.execute(
        'UPDATE order_notifications SET is_read = TRUE WHERE user_id = ? AND is_read = FALSE',
        [userId]
      );
    }
    
    res.json({
      success: true,
      notifications: notifications
    });
    
  } catch (error) {
    console.error('Get notifications error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch notifications'
    });
  }
});

// ================= GET UNREAD NOTIFICATION COUNT =================
router.get('/api/order-notifications/unread-count', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    
    const [result] = await db.execute(
      'SELECT COUNT(*) as count FROM order_notifications WHERE user_id = ? AND is_read = FALSE',
      [userId]
    );
    
    res.json({
      success: true,
      count: result[0].count
    });
    
  } catch (error) {
    console.error('Get unread count error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch unread count'
    });
  }
});


/* =====================================================
   EXPORT ROUTER (MUST BE LAST)
===================================================== */
module.exports = router;
