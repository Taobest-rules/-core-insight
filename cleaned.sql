
-- Table structure for admin_actions
CREATE TABLE `admin_actions` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `admin_id` int(11) NOT NULL,
  `action_type` varchar(50) NOT NULL,
  `target_id` int(11) NOT NULL,
  `target_type` varchar(50) NOT NULL,
  `reason` text NOT NULL,
  `details` longtext   DEFAULT NULL CHECK (json_valid(`details`)),
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_admin_actions_admin` (`admin_id`),
  KEY `idx_admin_actions_target` (`target_type`,`target_id`),
  CONSTRAINT `admin_actions_ibfk_1` FOREIGN KEY (`admin_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
)   DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;

-- Data for admin_actions

-- Table structure for commissions
CREATE TABLE `commissions` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `sale_id` int(11) NOT NULL,
  `seller_id` int(11) NOT NULL,
  `total_amount` decimal(10,2) NOT NULL,
  `commission_amount` decimal(10,2) NOT NULL,
  `platform_earning` decimal(10,2) NOT NULL,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`)
)  DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;

-- Data for commissions

-- Table structure for conversations
CREATE TABLE `conversations` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `service_id` int(11) NOT NULL,
  `client_id` int(11) NOT NULL,
  `freelancer_id` int(11) NOT NULL,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `service_id` (`service_id`,`client_id`,`freelancer_id`)
)   DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;

-- Data for conversations

-- Table structure for courses
CREATE TABLE `courses` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `title` varchar(255) NOT NULL,
  `description` text DEFAULT NULL,
  `file_path` varchar(500) DEFAULT NULL,
  `price` decimal(10,2) DEFAULT 0.00,
  `type` enum('free','paid') DEFAULT 'free',
  `user_id` int(11) NOT NULL,
  `author` varchar(100) NOT NULL,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`)
)   DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;

-- Data for courses

-- Table structure for deleted_services
CREATE TABLE `deleted_services` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `service_id` int(11) NOT NULL,
  `service_owner_id` int(11) NOT NULL,
  `deleted_by` int(11) NOT NULL,
  `deleted_by_role` enum('user','admin') NOT NULL,
  `reason` text DEFAULT NULL,
  `deleted_at` timestamp NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`)
)   DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;

-- Data for deleted_services

-- Table structure for favorites
CREATE TABLE `favorites` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `user_id` int(11) NOT NULL,
  `product_id` int(11) NOT NULL,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`)
)   DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;

-- Data for favorites

-- Table structure for freelancer_profiles
CREATE TABLE `freelancer_profiles` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `user_id` int(11) NOT NULL,
  `headline` varchar(200) DEFAULT NULL,
  `description` text DEFAULT NULL,
  `hourly_rate` decimal(10,2) DEFAULT 0.00,
  `skills` longtext   DEFAULT NULL CHECK (json_valid(`skills`)),
  `languages` longtext   DEFAULT NULL CHECK (json_valid(`languages`)),
  `experience_level` enum('beginner','intermediate','expert') DEFAULT 'intermediate',
  `website` varchar(255) DEFAULT NULL,
  `location` varchar(100) DEFAULT NULL,
  `phone` varchar(20) DEFAULT NULL,
  `education` text DEFAULT NULL,
  `certifications` text DEFAULT NULL,
  `availability` enum('available','busy','unavailable') DEFAULT 'available',
  `profile_picture` varchar(255) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `certificate_images` longtext   DEFAULT NULL CHECK (json_valid(`certificate_images`)),
  `profile_description` text DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_user` (`user_id`),
  CONSTRAINT `freelancer_profiles_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
)   DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;

-- Data for freelancer_profiles

-- Table structure for messages
CREATE TABLE `messages` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `conversation_id` int(11) NOT NULL,
  `sender_id` int(11) NOT NULL,
  `sender_role` enum('client','freelancer') NOT NULL,
  `message` text NOT NULL,
  `is_read` tinyint(1) DEFAULT 0,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_messages_conversation` (`conversation_id`),
  KEY `idx_messages_sender` (`sender_id`)
)   DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;

-- Data for messages

-- Table structure for order_messages
CREATE TABLE `order_messages` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `order_id` int(11) NOT NULL,
  `sender_id` int(11) NOT NULL,
  `receiver_id` int(11) NOT NULL,
  `message` text NOT NULL,
  `is_read` tinyint(1) DEFAULT 0,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `order_id` (`order_id`),
  KEY `sender_id` (`sender_id`),
  KEY `receiver_id` (`receiver_id`),
  CONSTRAINT `order_messages_ibfk_1` FOREIGN KEY (`order_id`) REFERENCES `orders` (`id`) ON DELETE CASCADE,
  CONSTRAINT `order_messages_ibfk_2` FOREIGN KEY (`sender_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `order_messages_ibfk_3` FOREIGN KEY (`receiver_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
)  DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;

-- Data for order_messages

-- Table structure for order_notifications
CREATE TABLE `order_notifications` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `order_id` int(11) NOT NULL,
  `user_id` int(11) NOT NULL,
  `type` enum('new_order','order_confirmed','order_shipped','order_delivered','order_cancelled') DEFAULT NULL,
  `message` text NOT NULL,
  `is_read` tinyint(1) DEFAULT 0,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `order_id` (`order_id`),
  KEY `user_id` (`user_id`),
  CONSTRAINT `order_notifications_ibfk_1` FOREIGN KEY (`order_id`) REFERENCES `orders` (`id`) ON DELETE CASCADE,
  CONSTRAINT `order_notifications_ibfk_2` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
)  DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;

-- Data for order_notifications

-- Table structure for order_tracking
CREATE TABLE `order_tracking` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `order_id` int(11) NOT NULL,
  `status` varchar(100) NOT NULL,
  `description` text DEFAULT NULL,
  `location` varchar(255) DEFAULT NULL,
  `estimated_delivery` date DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_order_id` (`order_id`),
  CONSTRAINT `order_tracking_ibfk_1` FOREIGN KEY (`order_id`) REFERENCES `physical_orders` (`id`) ON DELETE CASCADE
)  DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;

-- Data for order_tracking

-- Table structure for orders
CREATE TABLE `orders` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `order_code` varchar(50) NOT NULL,
  `product_id` int(11) NOT NULL,
  `buyer_id` int(11) NOT NULL,
  `seller_id` int(11) NOT NULL,
  `product_title` varchar(255) NOT NULL,
  `price` decimal(10,2) NOT NULL,
  `delivery_type` enum('pickup','delivery') DEFAULT 'pickup',
  `payment_option` varchar(50) DEFAULT 'pay_on_delivery',
  `delivery_locations` text DEFAULT NULL,
  `delivery_fee` decimal(10,2) DEFAULT 0.00,
  `status` enum('pending','confirmed','shipped','delivered','cancelled') DEFAULT 'pending',
  `notes` text DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `order_code` (`order_code`),
  KEY `product_id` (`product_id`),
  KEY `buyer_id` (`buyer_id`),
  KEY `seller_id` (`seller_id`),
  CONSTRAINT `orders_ibfk_1` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`) ON DELETE CASCADE,
  CONSTRAINT `orders_ibfk_2` FOREIGN KEY (`buyer_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `orders_ibfk_3` FOREIGN KEY (`seller_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
)  DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;

-- Data for orders

-- Table structure for payments
CREATE TABLE `payments` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `user_id` int(11) NOT NULL,
  `course_id` int(11) NOT NULL,
  `transaction_id` varchar(255) DEFAULT NULL,
  `transaction_ref` varchar(255) NOT NULL,
  `amount` decimal(10,2) NOT NULL,
  `status` enum('pending','completed','failed') DEFAULT 'pending',
  `flutterwave_response` longtext   DEFAULT NULL CHECK (json_valid(`flutterwave_response`)),
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `transaction_id` (`transaction_id`),
  KEY `user_id` (`user_id`),
  KEY `course_id` (`course_id`),
  CONSTRAINT `payments_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`),
  CONSTRAINT `payments_ibfk_2` FOREIGN KEY (`course_id`) REFERENCES `courses` (`id`)
)  DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;

-- Data for payments

-- Table structure for physical_orders
CREATE TABLE `physical_orders` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `product_name` varchar(255) NOT NULL,
  `product_type` varchar(100) DEFAULT NULL,
  `quantity` int(11) DEFAULT 1,
  `price` decimal(10,2) NOT NULL,
  `total_amount` decimal(10,2) NOT NULL,
  `customer_name` varchar(255) NOT NULL,
  `customer_email` varchar(255) NOT NULL,
  `customer_phone` varchar(50) DEFAULT NULL,
  `shipping_address` text NOT NULL,
  `city` varchar(100) DEFAULT NULL,
  `state` varchar(100) DEFAULT NULL,
  `country` varchar(100) DEFAULT NULL,
  `postal_code` varchar(50) DEFAULT NULL,
  `payment_method` varchar(50) DEFAULT 'flutterwave',
  `payment_status` enum('pending','paid','failed') DEFAULT 'pending',
  `order_status` enum('pending','processing','shipped','delivered','cancelled') DEFAULT 'pending',
  `transaction_id` varchar(255) DEFAULT NULL,
  `shipping_method` varchar(100) DEFAULT NULL,
  `shipping_cost` decimal(10,2) DEFAULT 0.00,
  `notes` text DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_email` (`customer_email`),
  KEY `idx_status` (`order_status`),
  KEY `idx_payment_status` (`payment_status`)
)  DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;

-- Data for physical_orders

-- Table structure for platform_commissions
CREATE TABLE `platform_commissions` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `sale_id` int(11) NOT NULL,
  `seller_id` int(11) NOT NULL,
  `total_amount` decimal(10,2) NOT NULL,
  `seller_earning` decimal(10,2) NOT NULL,
  `platform_earning` decimal(10,2) NOT NULL,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`)
)  DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;

-- Data for platform_commissions

-- Table structure for product_sales
CREATE TABLE `product_sales` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `product_id` int(11) NOT NULL,
  `seller_id` int(11) NOT NULL,
  `buyer_id` int(11) NOT NULL,
  `amount` decimal(10,2) NOT NULL,
  `transaction_id` varchar(100) NOT NULL,
  `status` varchar(50) DEFAULT 'completed',
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`)
)  DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;

-- Data for product_sales

-- Table structure for products
CREATE TABLE `products` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `user_id` int(11) NOT NULL,
  `title` varchar(255) NOT NULL,
  `description` text DEFAULT NULL,
  `price` decimal(10,2) NOT NULL,
  `category` varchar(100) DEFAULT NULL,
  `type` varchar(50) NOT NULL,
  `file_path` varchar(255) DEFAULT NULL,
  `images` text DEFAULT NULL,
  `affiliate_link` varchar(255) DEFAULT NULL,
  `delivery_type` enum('pickup','delivery') DEFAULT 'pickup',
  `delivery_locations` text DEFAULT NULL,
  `delivery_fee` decimal(10,2) DEFAULT 0.00,
  `payment_option` enum('pay_before_delivery','pay_on_delivery') DEFAULT 'pay_before_delivery',
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  `seller_payment_provider` enum('flutterwave','paystack') DEFAULT 'flutterwave',
  `rating` decimal(3,2) DEFAULT 0.00,
  `review_count` int(11) DEFAULT 0,
  `status` varchar(20) DEFAULT 'active',
  `sales_count` int(11) DEFAULT 0,
  PRIMARY KEY (`id`)
)   DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;

-- Data for products

-- Table structure for reviews
CREATE TABLE `reviews` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `user_id` int(11) NOT NULL,
  `product_id` int(11) NOT NULL,
  `rating` int(11) NOT NULL CHECK (`rating` >= 1 and `rating` <= 5),
  `comment` text NOT NULL,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_user_product` (`user_id`,`product_id`),
  KEY `product_id` (`product_id`),
  CONSTRAINT `reviews_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `reviews_ibfk_2` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`) ON DELETE CASCADE
)   DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;

-- Data for reviews

-- Table structure for sales
CREATE TABLE `sales` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `product_id` int(11) NOT NULL,
  `seller_id` int(11) NOT NULL,
  `buyer_id` int(11) NOT NULL,
  `amount` decimal(10,2) NOT NULL,
  `transaction_id` varchar(100) DEFAULT NULL,
  `payment_status` varchar(50) DEFAULT 'completed',
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`)
)  DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;

-- Data for sales

-- Table structure for seller_profiles
CREATE TABLE `seller_profiles` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `user_id` int(11) NOT NULL,
  `payment_provider` enum('flutterwave','paystack') DEFAULT 'flutterwave',
  `flutterwave_subaccount_id` varchar(255) DEFAULT NULL,
  `paystack_subaccount_id` varchar(255) DEFAULT NULL,
  `bank_name` varchar(255) DEFAULT NULL,
  `account_name` varchar(255) DEFAULT NULL,
  `account_number` varchar(100) DEFAULT NULL,
  `bank_code` varchar(50) DEFAULT NULL,
  `country` varchar(100) DEFAULT NULL,
  `currency` varchar(10) DEFAULT 'USD',
  `is_verified` tinyint(1) DEFAULT 0,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_user` (`user_id`),
  CONSTRAINT `seller_profiles_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`)
)  DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;

-- Data for seller_profiles

-- Table structure for sellers
CREATE TABLE `sellers` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `user_id` int(11) NOT NULL,
  `bank_code` varchar(10) DEFAULT NULL,
  `account_number` varchar(20) DEFAULT NULL,
  `business_name` varchar(255) DEFAULT NULL,
  `flutterwave_subaccount_id` varchar(50) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `user_id` (`user_id`),
  CONSTRAINT `sellers_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`)
)  DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;

-- Data for sellers

-- Table structure for service_delete_tracking
CREATE TABLE `service_delete_tracking` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `user_id` int(11) NOT NULL,
  `service_id` int(11) NOT NULL,
  `deleted_at` timestamp NULL DEFAULT current_timestamp(),
  `delete_reason` text DEFAULT NULL,
  `flagged` tinyint(1) DEFAULT 0,
  `reviewed_by_admin` tinyint(1) DEFAULT 0,
  PRIMARY KEY (`id`),
  KEY `user_id` (`user_id`),
  KEY `service_id` (`service_id`),
  CONSTRAINT `service_delete_tracking_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`),
  CONSTRAINT `service_delete_tracking_ibfk_2` FOREIGN KEY (`service_id`) REFERENCES `services` (`id`)
)  DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;

-- Data for service_delete_tracking

-- Table structure for service_orders
CREATE TABLE `service_orders` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `service_id` int(11) NOT NULL,
  `product_id` int(11) DEFAULT NULL,
  `buyer_id` int(11) NOT NULL,
  `amount` decimal(10,2) NOT NULL,
  `status` enum('pending','completed','cancelled') DEFAULT 'pending',
  `transaction_id` varchar(255) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `service_id` (`service_id`),
  KEY `product_id` (`product_id`),
  KEY `buyer_id` (`buyer_id`),
  CONSTRAINT `service_orders_ibfk_1` FOREIGN KEY (`service_id`) REFERENCES `services` (`id`),
  CONSTRAINT `service_orders_ibfk_2` FOREIGN KEY (`product_id`) REFERENCES `service_products` (`id`),
  CONSTRAINT `service_orders_ibfk_3` FOREIGN KEY (`buyer_id`) REFERENCES `users` (`id`)
)  DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;

-- Data for service_orders

-- Table structure for service_products
CREATE TABLE `service_products` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `service_id` int(11) NOT NULL,
  `title` varchar(255) NOT NULL,
  `price` decimal(10,2) NOT NULL,
  `description` text DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `service_id` (`service_id`),
  CONSTRAINT `service_products_ibfk_1` FOREIGN KEY (`service_id`) REFERENCES `services` (`id`)
)  DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;

-- Data for service_products

-- Table structure for service_reviews
CREATE TABLE `service_reviews` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `service_id` int(11) NOT NULL,
  `user_id` int(11) NOT NULL,
  `rating` int(11) NOT NULL CHECK (`rating` between 1 and 5),
  `comment` text DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `service_id` (`service_id`),
  KEY `user_id` (`user_id`),
  CONSTRAINT `service_reviews_ibfk_1` FOREIGN KEY (`service_id`) REFERENCES `services` (`id`),
  CONSTRAINT `service_reviews_ibfk_2` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`)
)  DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;

-- Data for service_reviews

-- Table structure for service_subscriptions
CREATE TABLE `service_subscriptions` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `user_id` int(11) NOT NULL,
  `service_id` int(11) NOT NULL,
  `trial_started_at` date NOT NULL,
  `trial_ends_at` date DEFAULT NULL,
  `status` enum('active','expired','cancelled') DEFAULT 'active',
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `user_id` (`user_id`),
  KEY `service_id` (`service_id`),
  CONSTRAINT `service_subscriptions_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`),
  CONSTRAINT `service_subscriptions_ibfk_2` FOREIGN KEY (`service_id`) REFERENCES `services` (`id`)
)   DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;

-- Data for service_subscriptions

-- Table structure for services
CREATE TABLE `services` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `user_id` int(11) NOT NULL,
  `title` varchar(255) NOT NULL,
  `description` longtext DEFAULT NULL,
  `price` decimal(10,2) NOT NULL,
  `category` varchar(255) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  `provider_profile_picture` varchar(255) DEFAULT NULL,
  `tags` longtext   DEFAULT NULL CHECK (json_valid(`tags`)),
  `delivery_time` varchar(100) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `user_id` (`user_id`),
  CONSTRAINT `services_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`)
)   DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;

-- Data for services

-- Table structure for user_courses
CREATE TABLE `user_courses` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `user_id` int(11) NOT NULL,
  `course_id` int(11) NOT NULL,
  `purchased_at` timestamp NULL DEFAULT current_timestamp(),
  `payment_status` enum('pending','completed','failed') DEFAULT 'pending',
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_user_course` (`user_id`,`course_id`),
  KEY `course_id` (`course_id`),
  CONSTRAINT `user_courses_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`),
  CONSTRAINT `user_courses_ibfk_2` FOREIGN KEY (`course_id`) REFERENCES `courses` (`id`)
)  DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;

-- Data for user_courses

-- Table structure for user_delete_monitoring
CREATE TABLE `user_delete_monitoring` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `user_id` int(11) NOT NULL,
  `username` varchar(100) DEFAULT NULL,
  `email` varchar(255) DEFAULT NULL,
  `delete_count_last_7_days` int(11) DEFAULT 0,
  `last_deleted_at` timestamp NULL DEFAULT NULL,
  `is_flagged` tinyint(1) DEFAULT 0,
  `flagged_reason` text DEFAULT NULL,
  `flagged_at` timestamp NULL DEFAULT NULL,
  `reviewed` tinyint(1) DEFAULT 0,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `user_id` (`user_id`),
  CONSTRAINT `user_delete_monitoring_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`)
)  DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;

-- Data for user_delete_monitoring

-- Table structure for users
CREATE TABLE `users` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `username` varchar(100) NOT NULL,
  `email` varchar(255) DEFAULT NULL,
  `password` varchar(255) NOT NULL,
  `role` varchar(20) DEFAULT 'user',
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  `verified` tinyint(1) DEFAULT 0,
  `verify_token` varchar(255) DEFAULT NULL,
  `reset_token` varchar(255) DEFAULT NULL,
  `reset_expires` datetime DEFAULT NULL,
  `flutterwave_account` varchar(255) DEFAULT NULL,
  `paystack_account` varchar(255) DEFAULT NULL,
  `daily_delete_count` int(11) DEFAULT 0,
  `last_delete_date` date DEFAULT NULL,
  `delete_warning_flag` tinyint(1) DEFAULT 0,
  `active` tinyint(1) DEFAULT 1,
  PRIMARY KEY (`id`),
  UNIQUE KEY `username` (`username`)
)   DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;

-- Data for users
INSERT INTO `admin_actions` (`id`, `admin_id`, `action_type`, `target_id`, `target_type`, `reason`, `details`, `created_at`) VALUES (1, 20, 'delete_service', 53, 'service', 'zdffzdf wrwewe', '{\"service_title\":\"Web designer\",\"provider_id\":22,\"original_price\":\"123.00\",\"category\":\"Marketing\",\"deleted_at\":\"2025-12-17T14:36:34.167Z\"}', '2025-12-17 14:36:34');
INSERT INTO `admin_actions` (`id`, `admin_id`, `action_type`, `target_id`, `target_type`, `reason`, `details`, `created_at`) VALUES (2, 20, 'delete_service', 52, 'service', 'gyuryfn bgyuig', '{\"service_title\":\"Web designer\",\"provider_id\":22,\"original_price\":\"11.00\",\"category\":\"Coaching\",\"deleted_at\":\"2025-12-17T23:39:39.381Z\"}', '2025-12-17 23:39:39');

-- Table is empty

INSERT INTO `conversations` (`id`, `service_id`, `client_id`, `freelancer_id`, `created_at`) VALUES (13, 22, 21, 22, '2025-12-25 22:41:00');
INSERT INTO `conversations` (`id`, `service_id`, `client_id`, `freelancer_id`, `created_at`) VALUES (14, 55, 21, 22, '2025-12-25 22:58:38');

INSERT INTO `courses` (`id`, `title`, `description`, `file_path`, `price`, `type`, `user_id`, `author`, `created_at`) VALUES (1, 'Atomic Habits', 'Tiny changes, remarkable results. This book reveals how building small, consistent habits and breaking bad ones is the key to achieving any goal. Forget grand gestures; learn how a 1% improvement every day can change your life.', 'uploads\\courses\\1758755800416-Atomic Habits.pdf', '0.00', 'free', 1, 'admin', '2025-09-24 23:16:40');
INSERT INTO `courses` (`id`, `title`, `description`, `file_path`, `price`, `type`, `user_id`, `author`, `created_at`) VALUES (2, 'AWhackOnTheSideOfTheHead', 'Unlock your creative potential by breaking through the ten mental locks that stifle innovation. This classic book provides the conceptual \"whacks\" you need to challenge assumptions, think differently, and generate brilliant ideas.', 'uploads\\courses\\1758759439514-AWhackOnTheSideOfTheHead.pdf', '0.00', 'free', 1, 'admin', '2025-09-25 00:17:19');
INSERT INTO `courses` (`id`, `title`, `description`, `file_path`, `price`, `type`, `user_id`, `author`, `created_at`) VALUES (3, 'Banned Charistma Secret Unleashed', 'Discover the forbidden psychological techniques and powerful communication secrets to instantly captivate anyone, build undeniable influence, and command every room you enter.', 'uploads\\courses\\1758759507574-Banned Charisma Secrets Unleashed_ Learn The Secrets Of Personal Magnetism And How To Attract, Inspire, Impress, Influence And Energize Anyone On Command - PDF Room.pdf', '0.00', 'free', 1, 'admin', '2025-09-25 00:18:27');
INSERT INTO `courses` (`id`, `title`, `description`, `file_path`, `price`, `type`, `user_id`, `author`, `created_at`) VALUES (4, 'Beyond Good And Evil', 'Friedrich Nietzsche’s profound philosophical work challenges the very foundations of traditional morality, urging readers to move \"beyond\" simple concepts of good and evil to create their own values and embrace the will to power.', 'uploads\\courses\\1758759593445-beyond-good-and-evil.pdf', '0.00', 'free', 1, 'admin', '2025-09-25 00:19:53');
INSERT INTO `courses` (`id`, `title`, `description`, `file_path`, `price`, `type`, `user_id`, `author`, `created_at`) VALUES (5, 'Deep work', 'In a world of constant distraction, the ability to focus without interruption on cognitively demanding tasks is a superpower. This book provides a rigorous training regimen to cultivate deep work, allowing you to master complex information and produce better results in less time.', 'uploads\\courses\\1758801909503-Deep Work_ Rules for focused success in a distracted world - PDF Room.pdf', '0.00', 'free', 1, 'admin', '2025-09-25 12:05:11');
INSERT INTO `courses` (`id`, `title`, `description`, `file_path`, `price`, `type`, `user_id`, `author`, `created_at`) VALUES (6, 'Thinking, Fast and slow', 'Nobel Prize winner Daniel Kahneman reveals the two systems that drive our thinking: the fast, intuitive System 1, and the slow, deliberate System 2. Understanding how they shape your judgments and decisions is essential for making smarter choices.', 'uploads\\courses\\1758801975504-Thinking, Fast and Slow.pdf', '0.00', 'free', 1, 'admin', '2025-09-25 12:06:16');
INSERT INTO `courses` (`id`, `title`, `description`, `file_path`, `price`, `type`, `user_id`, `author`, `created_at`) VALUES (7, 'Gödel, Escher, Bach: An Eternal Golden Braid', 'A Pulitzer Prize-winning exploration of the hidden connections between the mathematical genius of Kurt Gödel, the artistic genius of M.C. Escher, and the musical genius of Johann Sebastian Bach, all revolving around the profound ideas of patterns, loops, and self-reference.', 'uploads\\courses\\1758802031569-Douglas_R._Hofstadter-GÃ¶del,_Escher,_Bach__An_Eternal_Golden_Braid_(Twentieth-Anniversary_Edition)-Basic_Books(1999).pdf', '0.00', 'free', 1, 'admin', '2025-09-25 12:07:14');
INSERT INTO `courses` (`id`, `title`, `description`, `file_path`, `price`, `type`, `user_id`, `author`, `created_at`) VALUES (8, 'Gödel, Escher, Bach: An Eternal Golden Braid', 'A Pulitzer Prize-winning exploration of the hidden connections between the mathematical genius of Kurt Gödel, the artistic genius of M.C. Escher, and the musical genius of Johann Sebastian Bach, all revolving around the profound ideas of patterns, loops, and self-reference.', 'uploads\\courses\\1758802027407-Douglas_R._Hofstadter-GÃ¶del,_Escher,_Bach__An_Eternal_Golden_Braid_(Twentieth-Anniversary_Edition)-Basic_Books(1999).pdf', '0.00', 'free', 1, 'admin', '2025-09-25 12:07:14');
INSERT INTO `courses` (`id`, `title`, `description`, `file_path`, `price`, `type`, `user_id`, `author`, `created_at`) VALUES (9, ' Emotional Intelligence by Daniel Goleman', 'Argues that our emotional quotient (EQ)—self-awareness, self-regulation, motivation, empathy, and social skill—is a greater predictor of success than IQ, and provides the framework for understanding and improving this crucial skill.', 'uploads\\courses\\1758802087219-emotional-intelligence-daniel-goleman.pdf', '0.00', 'free', 1, 'admin', '2025-09-25 12:08:08');
INSERT INTO `courses` (`id`, `title`, `description`, `file_path`, `price`, `type`, `user_id`, `author`, `created_at`) VALUES (10, ' Hooked: How to Build Habit-Forming Products', 'Why do some products capture our attention effortlessly? This book reveals the \"Hook Model\"—a four-step cycle (trigger, action, variable reward, investment) used by successful companies to build customer habits.', 'uploads\\courses\\1758802134216-HOOKED.pdf', '0.00', 'free', 1, 'admin', '2025-09-25 12:09:06');
INSERT INTO `courses` (`id`, `title`, `description`, `file_path`, `price`, `type`, `user_id`, `author`, `created_at`) VALUES (11, ' How to Win Every Argument', 'A practical guide to the tactics, strategies, and logic of argumentation. Learn to recognize fallacies, structure your case persuasively, and effectively counter your opponent\'s points, whether in a formal debate or a casual discussion.', 'uploads\\courses\\1758802169250-How to Win Every Argument.pdf', '0.00', 'free', 1, 'admin', '2025-09-25 12:09:29');
INSERT INTO `courses` (`id`, `title`, `description`, `file_path`, `price`, `type`, `user_id`, `author`, `created_at`) VALUES (12, ' Indistractable', 'The problem isn\'t distraction; it\'s our inability to manage internal triggers and external interruptions. This book provides a framework to master internal motivation and control your time and attention, finally becoming the driver of your life.', 'uploads\\courses\\1758802215846-indistractible_compress.pdf', '0.00', 'free', 1, 'admin', '2025-09-25 12:10:16');
INSERT INTO `courses` (`id`, `title`, `description`, `file_path`, `price`, `type`, `user_id`, `author`, `created_at`) VALUES (13, 'The Willpower Instinct :how self control works_why', 'Explore the science of self-control, blending cutting-edge research from psychology and neuroscience into a practical guide for achieving your goals, managing stress, and breaking unhealthy habits by understanding how willpower works.', 'uploads\\courses\\1758802282280-LH-the_willpower_instinct_how_self_control_works_why_-8-15-2016.pdf', '0.00', 'free', 1, 'admin', '2025-09-25 12:11:23');
INSERT INTO `courses` (`id`, `title`, `description`, `file_path`, `price`, `type`, `user_id`, `author`, `created_at`) VALUES (14, 'Never Be Lied to Again', 'A comprehensive guide to detecting deception by analyzing verbal and non-verbal cues, from body language and facial micro-expressions to speech patterns and statement analysis.', 'uploads\\courses\\1758804149108-Lieberman, David J - Never Be Lied To Again.pdf', '0.00', 'free', 1, 'admin', '2025-09-25 12:42:29');
INSERT INTO `courses` (`id`, `title`, `description`, `file_path`, `price`, `type`, `user_id`, `author`, `created_at`) VALUES (15, ' Make Your Bed: Little things that can change your life and maybe the world', 'Based on the viral graduation speech, Admiral William H. McRaven argues that if you want to change the world, start by making your bed. This book expands on the ten life-changing lessons learned from Navy SEAL training.', 'uploads\\courses\\1758804323559-Make Your Bed_ Little Things That Can Change Your Life And Maybe The World - PDF Room.pdf', '0.00', 'free', 1, 'admin', '2025-09-25 12:45:23');
INSERT INTO `courses` (`id`, `title`, `description`, `file_path`, `price`, `type`, `user_id`, `author`, `created_at`) VALUES (16, 'Mindset: The Psychology of Success', 'Psychologist Carol S. Dweck reveals how our success in every area of life is influenced by whether we have a \"fixed\" mindset (believing our qualities are carved in stone) or a \"growth\" mindset (believing our abilities can be developed).', 'uploads\\courses\\1758804397750-Mindset-The-New-Psychology-of-Success-Dweck.pdf', '0.00', 'free', 1, 'admin', '2025-09-25 12:46:38');
INSERT INTO `courses` (`id`, `title`, `description`, `file_path`, `price`, `type`, `user_id`, `author`, `created_at`) VALUES (17, 'Money, and the Law of Attraction', 'This book teaches that focusing your thoughts and feelings on positive outcomes—using the Law of Attraction—is the key to attracting financial abundance and prosperity into your life.', 'uploads\\courses\\1758804430016-Money, and the Law of Attraction.pdf', '0.00', 'free', 1, 'admin', '2025-09-25 12:47:10');
INSERT INTO `courses` (`id`, `title`, `description`, `file_path`, `price`, `type`, `user_id`, `author`, `created_at`) VALUES (18, 'Moonwalking with Einstein', 'Journalist Joshua Foer chronicles his year-long journey from having an average memory to becoming the U.S. Memory Champion, exploring the ancient techniques and incredible potential of the trained human memory.', 'uploads\\courses\\1758804476968-moonwalking_with_einstein_-_foer__joshua.pdf', '0.00', 'free', 1, 'admin', '2025-09-25 12:47:57');
INSERT INTO `courses` (`id`, `title`, `description`, `file_path`, `price`, `type`, `user_id`, `author`, `created_at`) VALUES (19, 'Never Split the Difference : negotiating as if your life dependended on it', 'A former FBI lead international kidnapping negotiator teaches you how to use high-stakes negotiation tactics in your everyday life—from getting a raise to buying a car—by using emotional intelligence and tactical empathy.', 'uploads\\courses\\1758804547236-Never Split the Difference_ Negotiating As If Your Life Depended On It - PDF Room.pdf', '0.00', 'free', 1, 'admin', '2025-09-25 12:49:07');
INSERT INTO `courses` (`id`, `title`, `description`, `file_path`, `price`, `type`, `user_id`, `author`, `created_at`) VALUES (20, 'Peak: Secrets from the New Science of Expertise (SUMMARY)', 'Forget innate talent. This book argues that \"deliberate practice\"—a specific and highly focused type of effort—is the true secret to achieving exceptional performance in any field, from sports to music to business.', 'uploads\\courses\\1758804719693-Peak-by-Anders-Ericsson_Summary.pdf', '0.00', 'free', 1, 'admin', '2025-09-25 12:51:59');
INSERT INTO `courses` (`id`, `title`, `description`, `file_path`, `price`, `type`, `user_id`, `author`, `created_at`) VALUES (21, 'How to Solve It', 'A timeless heuristic guide by mathematician George Pólya, this book provides a four-step framework (Understand the problem, Devise a plan, Carry out the plan, Look back) for solving any problem, in mathematics and beyond.', 'uploads\\courses\\1758804764343-PolyaHowToSolveIt.pdf', '0.00', 'free', 1, 'admin', '2025-09-25 12:52:44');
INSERT INTO `courses` (`id`, `title`, `description`, `file_path`, `price`, `type`, `user_id`, `author`, `created_at`) VALUES (22, ' Rich Dad Poor Dad', 'Robert Kiyosaki contrasts the financial advice from his two \"dads\"—his own highly-educated but struggling father and the entrepreneurial father of his best friend—to challenge conventional beliefs about money, investing, and building wealth.', 'uploads\\courses\\1758804803470-Rich Dad Poor Dad.pdf', '0.00', 'free', 1, 'admin', '2025-09-25 12:53:23');
INSERT INTO `courses` (`id`, `title`, `description`, `file_path`, `price`, `type`, `user_id`, `author`, `created_at`) VALUES (23, ' Steal Like an Artist', 'A creative manifesto for the digital age, arguing that nothing is original and that all creative work builds on what came before. Embrace influence, remix ideas, and discover your artistic voice by thoughtfully \"stealing\" from others.', 'uploads\\courses\\1758804915404-Steal-LikeanArtist.pdf', '0.00', 'free', 1, 'admin', '2025-09-25 12:55:15');
INSERT INTO `courses` (`id`, `title`, `description`, `file_path`, `price`, `type`, `user_id`, `author`, `created_at`) VALUES (24, 'The Art of Hustling : sell or surrender', 'A guide to leveraging your street smarts, ambition, and networking skills to create opportunities, build wealth, and succeed on your own terms, often by bypassing traditional systems.', 'uploads\\courses\\1758805035369-The Art of Hustling _ Sell Or Surrender ( PDFDrive ).pdf', '0.00', 'free', 1, 'admin', '2025-09-25 12:57:15');
INSERT INTO `courses` (`id`, `title`, `description`, `file_path`, `price`, `type`, `user_id`, `author`, `created_at`) VALUES (25, 'The Art of Laziness', 'Argues that strategic laziness—working smarter, not harder—is a virtue. By focusing on efficiency, automation, and conserving energy for what truly matters, you can achieve more while doing less.', 'uploads\\courses\\1758805108812-The art of laziness.pdf', '0.00', 'free', 1, 'admin', '2025-09-25 12:58:28');
INSERT INTO `courses` (`id`, `title`, `description`, `file_path`, `price`, `type`, `user_id`, `author`, `created_at`) VALUES (26, 'The Art of Thinking Clearly', 'A clear-thinking toolkit that identifies 99 common cognitive biases and systematic errors in judgment that lead us astray, with practical advice on how to recognize and avoid them.', 'uploads\\courses\\1758805153560-the art of thinking clearly.pdf', '0.00', 'free', 1, 'admin', '2025-09-25 12:59:13');
INSERT INTO `courses` (`id`, `title`, `description`, `file_path`, `price`, `type`, `user_id`, `author`, `created_at`) VALUES (27, 'The Art of War', 'Sun Tzu\'s ancient Chinese military treatise on strategy, tactics, and deception remains a timeless guide to competition and conflict, offering wisdom for outmaneuvering opponents in business, law, and life.', 'uploads\\courses\\1758805266164-The Art of War_ Complete Text and Commentaries ( PDFDrive ).pdf', '0.00', 'free', 1, 'admin', '2025-09-25 13:01:06');
INSERT INTO `courses` (`id`, `title`, `description`, `file_path`, `price`, `type`, `user_id`, `author`, `created_at`) VALUES (28, ' Diary of a CEO', 'Steven Bartlett shares the raw and honest lessons, failures, and insights from his journey from a university dropout to a successful entrepreneur and podcaster, offering unconventional wisdom for life and business.\r\n\r\n', 'uploads\\courses\\1758805314699-The Diary of a CEO_ The 33 Laws of Business and Life - PDF Room.pdf', '0.00', 'free', 1, 'admin', '2025-09-25 13:01:54');
INSERT INTO `courses` (`id`, `title`, `description`, `file_path`, `price`, `type`, `user_id`, `author`, `created_at`) VALUES (29, ' The Seven (7) Habits of Highly Effective People', 'Stephen R. Covey\'s landmark book presents a principle-centered framework for personal and professional effectiveness, moving from dependence to independence to interdependence through seven foundational habits.', 'uploads\\courses\\1758805414384-THE SEVEN HABITS OF HIGHLY EFFECTIVE PEOPLE.pdf', '0.00', 'free', 1, 'admin', '2025-09-25 13:03:34');
INSERT INTO `courses` (`id`, `title`, `description`, `file_path`, `price`, `type`, `user_id`, `author`, `created_at`) VALUES (30, 'The Subtle Art of Not Giving a F*ck', 'A counterintuitive approach to living a good life, arguing that the key to happiness is not about being positive all the time, but about choosing what to care about and embracing honest confrontation with our problems.', 'uploads\\courses\\1758805448909-The Subtle Art of Not Giving a Fck A Counterintuitive Approach to Living a Good Life by Mark Manson (z-lib.org).pdf', '0.00', 'free', 1, 'admin', '2025-09-25 13:04:08');
INSERT INTO `courses` (`id`, `title`, `description`, `file_path`, `price`, `type`, `user_id`, `author`, `created_at`) VALUES (31, 'The 48 Laws of Power', 'A controversial and amoral distillation of 3,000 years of power dynamics, presenting laws for gaining and maintaining power, drawn from the philosophies of Machiavelli, Sun Tzu, and other historical strategists.', 'uploads\\courses\\1758807703998-The+48+Laws+Of+Power.pdf', '0.00', 'free', 1, 'admin', '2025-09-25 13:41:45');
INSERT INTO `courses` (`id`, `title`, `description`, `file_path`, `price`, `type`, `user_id`, `author`, `created_at`) VALUES (32, 'The Psychology of Money', 'Morgan Housel explores the strange and complex ways people think about money, arguing that doing well with finances has less to do with intelligence and more to do with behavior, soft skills, and understanding your own psychology.', 'uploads\\courses\\1758807797478-The_Psychology_of_Money__Timeless_Lessons_-_Morgan_Housel.pdf', '0.00', 'free', 1, 'admin', '2025-09-25 13:43:17');
INSERT INTO `courses` (`id`, `title`, `description`, `file_path`, `price`, `type`, `user_id`, `author`, `created_at`) VALUES (33, ' The Memory Book', 'The classic guide to improving your memory by Harry Lorayne and Jerry Lucas, teaching simple and powerful mnemonic techniques like the peg system and the method of loci to remember names, numbers, and information.', 'uploads\\courses\\1758807852513-the-memory-book-the-classic-guide-to-improving-your-memory-at-work-at-school-and-at-play_compress.pdf', '0.00', 'free', 1, 'admin', '2025-09-25 13:44:12');
INSERT INTO `courses` (`id`, `title`, `description`, `file_path`, `price`, `type`, `user_id`, `author`, `created_at`) VALUES (34, 'Think Like a Grandmaster', 'A practical guide to the thought processes of expert chess players, breaking down how to evaluate positions, calculate variations, and form a plan, offering valuable insights into strategic thinking for any complex endeavor.', 'uploads\\courses\\1758807892571-toaz.info-alexander-kotov-think-like-a-grandmasterpdf-pr_deedb75f39b5059211c9274d4c336513.pdf', '0.00', 'free', 1, 'admin', '2025-09-25 13:44:52');
INSERT INTO `courses` (`id`, `title`, `description`, `file_path`, `price`, `type`, `user_id`, `author`, `created_at`) VALUES (35, 'What Every Body is Saying', 'A former FBI counterintelligence agent provides a comprehensive guide to mastering the language of the body, teaching you how to read non-verbal cues to understand people\'s true feelings and intentions.', 'uploads\\courses\\1758807945927-What Every BODY is Saying.pdf', '0.00', 'free', 1, 'admin', '2025-09-25 13:45:46');
INSERT INTO `courses` (`id`, `title`, `description`, `file_path`, `price`, `type`, `user_id`, `author`, `created_at`) VALUES (36, ' What Color Is Your Parachute?', 'The world\'s most popular job-hunting guide, updated annually, which goes beyond resumes to help you discover your passions, skills, and ideal work environment to find a fulfilling career.', 'uploads\\courses\\1758807977237-what-color-is-your-parachute--2022.pdf', '0.00', 'free', 1, 'admin', '2025-09-25 13:46:17');
INSERT INTO `courses` (`id`, `title`, `description`, `file_path`, `price`, `type`, `user_id`, `author`, `created_at`) VALUES (37, 'Why We Sleep', 'Neuroscientist Matthew Walker uncovers the vital importance of sleep, explaining how it enhances learning, memory, and health, while sleep deprivation harms every aspect of our biology, from our immune system to our lifespan.', 'uploads\\courses\\1758808012252-Why We Sleep.pdf', '0.00', 'free', 1, 'admin', '2025-09-25 13:46:52');
INSERT INTO `courses` (`id`, `title`, `description`, `file_path`, `price`, `type`, `user_id`, `author`, `created_at`) VALUES (38, 'Word Power Made Easy', 'The timeless vocabulary builder that teaches you words by grouping them into thematic roots and origins, making it easier to learn, remember, and use a more powerful and sophisticated vocabulary.', 'uploads\\courses\\1758808049706-WORD POWER MADE EASY.pdf', '0.00', 'free', 1, 'admin', '2025-09-25 13:47:29');
INSERT INTO `courses` (`id`, `title`, `description`, `file_path`, `price`, `type`, `user_id`, `author`, `created_at`) VALUES (39, ' You Are Not So Smart', 'An entertaining exploration of self-delusion, revealing the myriad ways our brains are wired to mislead us, through cognitive biases, heuristics, and irrationalities that we consistently fail to recognize.', 'uploads\\courses\\1758808084911-you-are-not-so-smart.pdf', '0.00', 'free', 1, 'admin', '2025-09-25 13:48:04');
INSERT INTO `courses` (`id`, `title`, `description`, `file_path`, `price`, `type`, `user_id`, `author`, `created_at`) VALUES (40, 'On Writing Well', 'The classic guide to writing nonfiction that emphasizes clarity, simplicity, and style. William Zinsser provides fundamental principles for crafting effective prose, from memoirs and articles to business reports.\r\n\r\n', 'uploads\\courses\\1758808122193-Zinsser_on_Writing_Well.pdf', '0.00', 'free', 1, 'admin', '2025-09-25 13:48:42');
INSERT INTO `courses` (`id`, `title`, `description`, `file_path`, `price`, `type`, `user_id`, `author`, `created_at`) VALUES (49, 'Affiliate Marketing: From Beginner to Pro – Complete Course + Workbook', 'Learn how to earn passive income by promoting top brands and products online.\r\nThis master course teaches you everything about affiliate networks, niche selection, traffic generation, and conversion optimization.', 'uploads\\courses\\1759998271358-Affiliate Marketing pdf.pdf', '0.00', 'free', 20, 'Core Insight Academy', '2025-10-09 08:24:31');
INSERT INTO `courses` (`id`, `title`, `description`, `file_path`, `price`, `type`, `user_id`, `author`, `created_at`) VALUES (50, 'Dropshipping: From Beginner to Pro – Complete Course + Workbook', 'Start your own eCommerce business without inventory.\r\nLearn the step-by-step process of building a dropshipping store, sourcing suppliers, running ads, and scaling profits.', 'uploads\\courses\\1759998496924-Dropshipping pdf.pdf', '23000.00', 'paid', 20, 'Core Insight Academy (Digital Skills Division)', '2025-10-09 08:28:16');
INSERT INTO `courses` (`id`, `title`, `description`, `file_path`, `price`, `type`, `user_id`, `author`, `created_at`) VALUES (53, '🎨 Adobe Illustrator – Beginner to Advanced Full Course + Workbook', 'Unlock your creative potential with Adobe Illustrator, the world’s leading vector graphics software.\r\nFrom complete beginner to advanced designer, this course walks you through every step with practical projects, exercises, and a hands-on workbook.\r\n\r\nWhether you want to design logos, icons, packaging, infographics, or digital illustrations, this course gives you the exact tools and workflow professionals use worldwide.', 'uploads\\courses\\1759999283974-Adobe Illustrator pdf.pdf', '0.00', 'free', 20, 'Core Insight Academy (Digital Skills Division)', '2025-10-09 08:41:24');
INSERT INTO `courses` (`id`, `title`, `description`, `file_path`, `price`, `type`, `user_id`, `author`, `created_at`) VALUES (55, 'Content Marketing Mastery — Full Course + Interactive Workbook', 'Master the art and science of content marketing from understanding your audience to creating content that converts.\r\nYou’ll learn to plan, write, publish, and measure content that builds authority, drives leads, and grows your business sustainably.', 'uploads\\courses\\1759999508924-Content Marketing pdf.pdf', '0.00', 'free', 20, 'Core Insight Academy (Digital Skills Division)', '2025-10-09 08:45:08');
INSERT INTO `courses` (`id`, `title`, `description`, `file_path`, `price`, `type`, `user_id`, `author`, `created_at`) VALUES (56, 'Microsoft Excel – Complete Masterclass: From Beginner to Advanced + Workbook', 'Master Microsoft Excel from the ground up  learn how to organize data, analyze information, and automate tasks like a pro.\r\nThis course takes you from the basics of spreadsheets to advanced data analysis, formulas, and dashboards used by professionals in business, finance, and tech.', 'uploads\\courses\\1759999843891-Excel.pdf.pdf', '10000.00', 'paid', 20, 'Core Insight Academy (Digital Skills Division)', '2025-10-09 08:50:43');
INSERT INTO `courses` (`id`, `title`, `description`, `file_path`, `price`, `type`, `user_id`, `author`, `created_at`) VALUES (58, 'Microsoft Outlook – Complete Masterclass: From Beginner to Pro + Workbook', 'Master Your Inbox, Calendar, and Workflow Like a Pro!\r\nThis complete Microsoft Outlook course teaches you how to manage emails, contacts, meetings, and tasks effectively. Whether for business, freelancing, or personal productivity — you’ll learn how to organize your work and save hours every week.', 'uploads\\courses\\1760000990717-Microsoft Outlook pdf.pdf', '16000.00', 'paid', 20, 'Core Insight Academy', '2025-10-09 09:09:50');
INSERT INTO `courses` (`id`, `title`, `description`, `file_path`, `price`, `type`, `user_id`, `author`, `created_at`) VALUES (59, 'Complete JavaScript Course: Learn by Building Projects + Interactive Workbook', 'A complete hands-on JavaScript course designed for absolute beginners to intermediate learners, featuring:\r\n\r\n8 full modules with step-by-step lessons, practice workbooks, and 8 portfolio-ready projects\r\n\r\nCovers fundamentals → DOM → APIs → Local Storage → Final Capstone App', 'uploads\\courses\\1760001204652-JavaScript Course pdf.pdf', '16900.00', 'paid', 20, 'Core Insight Academy', '2025-10-09 09:13:24');
INSERT INTO `courses` (`id`, `title`, `description`, `file_path`, `price`, `type`, `user_id`, `author`, `created_at`) VALUES (60, 'ARTIFICIAL INTELLIGENCE', 'Read about the benefits, uses, advantages & disadvantages of Artificial Intelligence', 'uploads\\courses\\1760001673639-Artificial intelligence pdf.pdf', '0.00', 'free', 20, 'Core Insight Academy', '2025-10-09 09:21:13');

INSERT INTO `deleted_services` (`id`, `service_id`, `service_owner_id`, `deleted_by`, `deleted_by_role`, `reason`, `deleted_at`) VALUES (1, 24, 22, 20, 'admin', 'srfwarer ewre', '2025-12-20 19:42:10');

INSERT INTO `favorites` (`id`, `user_id`, `product_id`, `created_at`) VALUES (3, 20, 1, '2025-10-25 16:27:13');
INSERT INTO `favorites` (`id`, `user_id`, `product_id`, `created_at`) VALUES (6, 20, 2, '2025-10-27 20:29:19');
INSERT INTO `favorites` (`id`, `user_id`, `product_id`, `created_at`) VALUES (8, 20, 11, '2025-10-27 21:18:03');
INSERT INTO `favorites` (`id`, `user_id`, `product_id`, `created_at`) VALUES (13, 20, 10, '2025-11-21 20:16:03');
INSERT INTO `favorites` (`id`, `user_id`, `product_id`, `created_at`) VALUES (14, 20, 13, '2025-11-22 11:02:46');
INSERT INTO `favorites` (`id`, `user_id`, `product_id`, `created_at`) VALUES (15, 20, 14, '2025-11-22 11:02:49');
INSERT INTO `favorites` (`id`, `user_id`, `product_id`, `created_at`) VALUES (16, 20, 16, '2025-11-22 11:02:52');
INSERT INTO `favorites` (`id`, `user_id`, `product_id`, `created_at`) VALUES (20, 21, 12, '2025-11-22 11:08:57');
INSERT INTO `favorites` (`id`, `user_id`, `product_id`, `created_at`) VALUES (21, 21, 11, '2025-11-22 11:08:59');
INSERT INTO `favorites` (`id`, `user_id`, `product_id`, `created_at`) VALUES (23, 21, 16, '2025-11-22 11:09:14');
INSERT INTO `favorites` (`id`, `user_id`, `product_id`, `created_at`) VALUES (24, 21, 33, '2025-11-23 11:19:56');
INSERT INTO `favorites` (`id`, `user_id`, `product_id`, `created_at`) VALUES (25, 21, 34, '2025-11-23 11:20:01');
INSERT INTO `favorites` (`id`, `user_id`, `product_id`, `created_at`) VALUES (26, 21, 4, '2025-11-23 11:20:08');
INSERT INTO `favorites` (`id`, `user_id`, `product_id`, `created_at`) VALUES (28, 20, 4, '2025-11-23 11:20:30');
INSERT INTO `favorites` (`id`, `user_id`, `product_id`, `created_at`) VALUES (29, 20, 15, '2025-11-23 19:28:02');
INSERT INTO `favorites` (`id`, `user_id`, `product_id`, `created_at`) VALUES (31, 22, 34, '2025-12-27 17:43:22');

INSERT INTO `freelancer_profiles` (`id`, `user_id`, `headline`, `description`, `hourly_rate`, `skills`, `languages`, `experience_level`, `website`, `location`, `phone`, `education`, `certifications`, `availability`, `profile_picture`, `created_at`, `updated_at`, `certificate_images`, `profile_description`) VALUES (1, 22, 'Senior Web developer', 'i\'m a skilled programmer and i offer top tier services to my clients', '60.00', '[\"Web Development\",\"JavaScript\",\"React\",\"Node.js\",\"UI/UX Design\",\"Problem Solving\",\"Digital Marketing\"]', '[\"English German Arabic French\"]', 'expert', 'http://localhost:3000/services.html', 'Nigeria', '09038907536', 'i studied at the best university in the world', 'i possess Freecodecamp certificates and the odin project', 'available', '/uploads/profiles/profile-1765047122309-ChatGPT_Image_Nov_30__2025__06_47_02_PM.png', '2025-11-29 09:11:05', '2025-12-27 21:02:02', '[\"/uploads/profiles/profile-1766869321888-S110db4df6d3a4cd6892ede566abdbcbd0.jpg\",\"/uploads/profiles/profile-1766869321912-S75f5f5b9d7064c06bb5fa978a9aa92fej.jpg\",\"/uploads/profiles/profile-1766869321993-S07f040daedc140a4bf5b51bfa0f6e1e4T.png\"]', NULL);
INSERT INTO `freelancer_profiles` (`id`, `user_id`, `headline`, `description`, `hourly_rate`, `skills`, `languages`, `experience_level`, `website`, `location`, `phone`, `education`, `certifications`, `availability`, `profile_picture`, `created_at`, `updated_at`, `certificate_images`, `profile_description`) VALUES (51, 20, 'New Freelancer', 'Tell clients about yourself and your services...', '25.00', '[]', '[]', 'intermediate', NULL, NULL, NULL, NULL, NULL, 'available', NULL, '2025-12-19 14:25:50', '2025-12-19 14:25:50', NULL, NULL);

INSERT INTO `messages` (`id`, `conversation_id`, `sender_id`, `sender_role`, `message`, `is_read`, `created_at`) VALUES (1, 13, 21, 'client', 'hello what\'s popin', 0, '2025-12-25 22:56:33');
INSERT INTO `messages` (`id`, `conversation_id`, `sender_id`, `sender_role`, `message`, `is_read`, `created_at`) VALUES (2, 14, 21, 'client', 'hello what\'s popin', 0, '2025-12-25 22:58:48');
INSERT INTO `messages` (`id`, `conversation_id`, `sender_id`, `sender_role`, `message`, `is_read`, `created_at`) VALUES (3, 14, 21, 'client', 'Allah is the greatest', 0, '2025-12-25 22:59:19');

-- Table is empty

-- Table is empty

-- Table is empty

-- Table is empty

-- Table is empty

-- Table is empty

-- Table is empty

-- Table is empty

INSERT INTO `products` (`id`, `user_id`, `title`, `description`, `price`, `category`, `type`, `file_path`, `images`, `affiliate_link`, `delivery_type`, `delivery_locations`, `delivery_fee`, `payment_option`, `created_at`, `seller_payment_provider`, `rating`, `review_count`, `status`, `sales_count`) VALUES (2, 20, 'Bluetooth-Compatible Noise Canceling Earbuds', 'Experience next-level sound with these sleek translucent earbuds - built for sports, work, and everyday use.\r\n Crystal-clear audio + powerful noise cancellation\r\n Digital display charging case to track your battery in style\r\nCompact & comfortable for all-day wear', '0.99', 'Electronic Components', 'affiliate', NULL, '[\"/uploads/products/1761410268555-S089afbc5aca840b3aafbd47d0c96f02f3.jpg\"]', 'https://s.click.aliexpress.com/e/_c3pi8PXd', NULL, NULL, NULL, NULL, '2025-10-25 16:37:48', 'flutterwave', '4.50', 2, 'active', 0);
INSERT INTO `products` (`id`, `user_id`, `title`, `description`, `price`, `category`, `type`, `file_path`, `images`, `affiliate_link`, `delivery_type`, `delivery_locations`, `delivery_fee`, `payment_option`, `created_at`, `seller_payment_provider`, `rating`, `review_count`, `status`, `sales_count`) VALUES (4, 20, 'GENEVA High-Quality Men’s Luxury Belt Fashion Quartz Watch', 'Upgrade your look with the GENEVA High-Quality Men’s Luxury Belt Watch, a perfect blend of style, durability, and precision. Whether you’re heading to a business meeting, class, or the gym, this watch keeps you looking sharp and confident', '0.99', 'Men\'s accesories', 'affiliate', NULL, '[\"/uploads/products/1761418541034-Sc801b072e9734756a205692cd637b0f2j.jpg\"]', 'https://s.click.aliexpress.com/e/_c45glu4F', NULL, NULL, NULL, NULL, '2025-10-25 18:55:41', 'flutterwave', '0.00', 0, 'active', 0);
INSERT INTO `products` (`id`, `user_id`, `title`, `description`, `price`, `category`, `type`, `file_path`, `images`, `affiliate_link`, `delivery_type`, `delivery_locations`, `delivery_fee`, `payment_option`, `created_at`, `seller_payment_provider`, `rating`, `review_count`, `status`, `sales_count`) VALUES (10, 20, 'LIGE 2025 Smart Watch Women Men Lady Gift Sport Fitness Watches Heart Rate Monitor Waterproof Smartwatch For Xiaomi Android IOS', '', '9.87', 'Electronic Components', 'affiliate', NULL, '[\"/uploads/products/1761596943402-He60b62bb0568427882d698030b779693Y.jpg\",\"/uploads/products/1761596943420-H60d361ca585943f7954cb77f920c530bT.jpg\",\"/uploads/products/1761596943423-S6f61ad6ca5a54f8193072a36a0f887a1m.png\"]', 'https://s.click.aliexpress.com/e/_c32AfyZ1', NULL, NULL, NULL, NULL, '2025-10-27 20:29:03', 'flutterwave', '0.00', 0, 'active', 0);
INSERT INTO `products` (`id`, `user_id`, `title`, `description`, `price`, `category`, `type`, `file_path`, `images`, `affiliate_link`, `delivery_type`, `delivery_locations`, `delivery_fee`, `payment_option`, `created_at`, `seller_payment_provider`, `rating`, `review_count`, `status`, `sales_count`) VALUES (11, 20, 'New TWS M25 Bluetooth 5.3 TWS Wireless Headphones with LED Display Stereo Headset Touch Control Earbuds Noise Reduction', '', '0.99', 'All categories', 'affiliate', NULL, '[\"/uploads/products/1761597161890-Se165cd5502fb40e0aa0566e71a1293a6k.jpg\",\"/uploads/products/1761597161891-Sbbd775924c374f6891aba5d7eb8b10319.jpg\",\"/uploads/products/1761597161893-Sb46b0666ac0e4c9fa99bc31b48362fa3D.jpg\"]', 'https://s.click.aliexpress.com/e/_c2xsqZ7D', NULL, NULL, NULL, NULL, '2025-10-27 20:32:41', 'flutterwave', '0.00', 0, 'active', 0);
INSERT INTO `products` (`id`, `user_id`, `title`, `description`, `price`, `category`, `type`, `file_path`, `images`, `affiliate_link`, `delivery_type`, `delivery_locations`, `delivery_fee`, `payment_option`, `created_at`, `seller_payment_provider`, `rating`, `review_count`, `status`, `sales_count`) VALUES (12, 20, 'AIR31 TWS Headphones 5.3 Wireless Earphones Bluetooth Headset Noise Cancelling HD HiFi Stereo Earbuds For Huawei Xiaomi iPhone', '', '0.99', '', 'affiliate', NULL, '[\"/uploads/products/1761597306242-Scd58a30cf5ae4ac98880317c1a08017bh.jpg\",\"/uploads/products/1761597306243-Sd41e356f7b47437a9c48358937a3e1be5.jpg\",\"/uploads/products/1761597306244-S38beb2a0411a494daedd4e5058164f8dT.jpg\"]', 'https://s.click.aliexpress.com/e/_c3veTpkj', NULL, NULL, NULL, NULL, '2025-10-27 20:35:06', 'flutterwave', '0.00', 0, 'active', 0);
INSERT INTO `products` (`id`, `user_id`, `title`, `description`, `price`, `category`, `type`, `file_path`, `images`, `affiliate_link`, `delivery_type`, `delivery_locations`, `delivery_fee`, `payment_option`, `created_at`, `seller_payment_provider`, `rating`, `review_count`, `status`, `sales_count`) VALUES (13, 20, '2024 New Bluetooth Call Smart Watch Men 360*360 HD Display Heart Rate Fitness Tracker ECG+PPG Business Smartwatches For Huawei', '', '11.64', '', 'affiliate', NULL, '[\"/uploads/products/1761597414476-S0c101dcc52374bf581428f4c5e9d058dA.jpg\",\"/uploads/products/1761597414477-S948d9af740604a56b70ae285bcb9e4c2v.jpg\",\"/uploads/products/1761597414480-S64b3bebc0ab44d4ea52cff48c266ec25I.jpg\"]', 'https://s.click.aliexpress.com/e/_c3MsDUWF', NULL, NULL, NULL, NULL, '2025-10-27 20:36:54', 'flutterwave', '4.00', 1, 'active', 0);
INSERT INTO `products` (`id`, `user_id`, `title`, `description`, `price`, `category`, `type`, `file_path`, `images`, `affiliate_link`, `delivery_type`, `delivery_locations`, `delivery_fee`, `payment_option`, `created_at`, `seller_payment_provider`, `rating`, `review_count`, `status`, `sales_count`) VALUES (14, 20, '2025 NEW Smart Watch Women Men AMOLED Screen Bluetooth Call Full Touch Screen Weather Call Sports Smart Bracelet 5ATM Waterproof', '', '6.35', '', 'affiliate', NULL, '[\"/uploads/products/1761597566362-Sd791b2dd1e664973800b59df9642c8ccZ.jpg\",\"/uploads/products/1761597566363-S112b36287e0245db96468b312d0145db3.jpg\",\"/uploads/products/1761597566366-S92c97d329a27461996f12b2305990aab8.jpg\"]', 'https://s.click.aliexpress.com/e/_c3TCZL0T', NULL, NULL, NULL, NULL, '2025-10-27 20:39:26', 'flutterwave', '0.00', 0, 'active', 0);
INSERT INTO `products` (`id`, `user_id`, `title`, `description`, `price`, `category`, `type`, `file_path`, `images`, `affiliate_link`, `delivery_type`, `delivery_locations`, `delivery_fee`, `payment_option`, `created_at`, `seller_payment_provider`, `rating`, `review_count`, `status`, `sales_count`) VALUES (15, 20, 'LIGE Smart Watch Women Men Full Touch Screen Bluetooth 5.2 Call Waterproof Watches Sports Fitness Tracker Factory IP67 ZL02 New', '', '9.59', '', 'affiliate', NULL, '[\"/uploads/products/1761597666053-S4e04b0e408894a7b8c09ff20d1548375F.jpg\",\"/uploads/products/1761597666054-Sf0d885ec679e46fda1aa836b5e0332f5I.jpg\",\"/uploads/products/1761597666056-S02179e03444d4cd2822e0aef0d9f5318C.png\"]', 'https://s.click.aliexpress.com/e/_c3XmUMBV', NULL, NULL, NULL, NULL, '2025-10-27 20:41:06', 'flutterwave', '0.00', 0, 'active', 0);
INSERT INTO `products` (`id`, `user_id`, `title`, `description`, `price`, `category`, `type`, `file_path`, `images`, `affiliate_link`, `delivery_type`, `delivery_locations`, `delivery_fee`, `payment_option`, `created_at`, `seller_payment_provider`, `rating`, `review_count`, `status`, `sales_count`) VALUES (16, 20, '2025 For HUAWEI GT5 Pro GPS Track Smart Watch Men 360*360 AMOLED Screen NFC BT Call Waterproof Health Monitor Man Smartwatches', '', '20.15', '', 'affiliate', NULL, '[\"/uploads/products/1761597765463-S5ba37134fba547ae9dc1054457040ad1H.jpg\",\"/uploads/products/1761597765464-Se7c5e93c494d40538628fe6dba81a8dca.jpg\",\"/uploads/products/1761597765466-S63633c22637049aebb5aacebf528fc1aV.jpg\"]', 'https://s.click.aliexpress.com/e/_c42F3Fc7', NULL, NULL, NULL, NULL, '2025-10-27 20:42:45', 'flutterwave', '0.00', 0, 'active', 0);
INSERT INTO `products` (`id`, `user_id`, `title`, `description`, `price`, `category`, `type`, `file_path`, `images`, `affiliate_link`, `delivery_type`, `delivery_locations`, `delivery_fee`, `payment_option`, `created_at`, `seller_payment_provider`, `rating`, `review_count`, `status`, `sales_count`) VALUES (29, 20, 'Multifunctional Universal for F3 F3 Pro Electric Scooter Rear Wheel Waterproof', '', '29.50', 'Sports & Entertainments', 'affiliate', NULL, '[\"/uploads/products/1763829936691-Sd18c0dce29da412fb3d0262ba486f944S.jpg\",\"/uploads/products/1763829936701-Scb3d6401df2d4839bd0743f4e31940bci.jpg\",\"/uploads/products/1763829936719-Sd933d8230dfd4ed6835babbe4ee296c5N.jpg\"]', 'https://s.click.aliexpress.com/e/_c30dnMOv', NULL, NULL, NULL, NULL, '2025-11-22 16:45:36', 'paystack', '0.00', 0, 'active', 0);
INSERT INTO `products` (`id`, `user_id`, `title`, `description`, `price`, `category`, `type`, `file_path`, `images`, `affiliate_link`, `delivery_type`, `delivery_locations`, `delivery_fee`, `payment_option`, `created_at`, `seller_payment_provider`, `rating`, `review_count`, `status`, `sales_count`) VALUES (30, 20, 'Retro T9 Original Haircutting Machine Set Jackets Trimmer Men\'s Electric Shaver Male Lence Pro Barber Shaver for Sensitive Areas', '', '0.99', 'Home Appliances', 'affiliate', NULL, '[\"/uploads/products/1763850829443-S6d6ecb63b33b40c9922bfccc8ba29ec1d.jpg\",\"/uploads/products/1763850829470-S10225a9860ab4a52bf359fd60db9ebafK.jpg\",\"/uploads/products/1763850829574-S0139488e654848fbbacc85039f31e20b1.jpg\"]', 'https://s.click.aliexpress.com/e/_c4O9dd4D', NULL, NULL, NULL, NULL, '2025-11-22 22:33:49', 'paystack', '0.00', 0, 'active', 0);
INSERT INTO `products` (`id`, `user_id`, `title`, `description`, `price`, `category`, `type`, `file_path`, `images`, `affiliate_link`, `delivery_type`, `delivery_locations`, `delivery_fee`, `payment_option`, `created_at`, `seller_payment_provider`, `rating`, `review_count`, `status`, `sales_count`) VALUES (31, 20, 'Car Seat Gap Filler Side Seam Plug Strip Leak-proof Filling Strip For All Car Model Wallet Phone Holder Car Accessories', '', '0.99', 'Automobile Accessories', 'affiliate', NULL, '[\"/uploads/products/1763851045612-Sca65f870d2e6460fa00cc801165e3905s.jpg\",\"/uploads/products/1763851045616-S5f812b1887c44e268f6507c45589703a6.jpg\",\"/uploads/products/1763851045621-Sfef2cd4c7fec4e2fb797237f4502faadl.jpg\"]', 'https://s.click.aliexpress.com/e/_c4mTkQYV', NULL, NULL, NULL, NULL, '2025-11-22 22:37:25', 'paystack', '0.00', 0, 'active', 0);
INSERT INTO `products` (`id`, `user_id`, `title`, `description`, `price`, `category`, `type`, `file_path`, `images`, `affiliate_link`, `delivery_type`, `delivery_locations`, `delivery_fee`, `payment_option`, `created_at`, `seller_payment_provider`, `rating`, `review_count`, `status`, `sales_count`) VALUES (32, 20, 'KINGROON 22LBS PETG or PLA filament 3D Printer Filament 10 Rolls 1KG 1.75MM Eco-Friendly Good Toughness Mix Color', '', '70.40', 'Home Appliances', 'affiliate', NULL, '[\"/uploads/products/1763851193145-Saeedba0c17f04df7ba956fe84c2a6ce4Q.jpg\",\"/uploads/products/1763851193148-S82d65b275b264163b6458ca6bc7c9902G.jpg\",\"/uploads/products/1763851193149-Se3317fcc76064dff850b1b920c9b5c98z.jpg\"]', NULL, NULL, NULL, NULL, NULL, '2025-11-22 22:39:53', 'paystack', '0.00', 0, 'active', 0);
INSERT INTO `products` (`id`, `user_id`, `title`, `description`, `price`, `category`, `type`, `file_path`, `images`, `affiliate_link`, `delivery_type`, `delivery_locations`, `delivery_fee`, `payment_option`, `created_at`, `seller_payment_provider`, `rating`, `review_count`, `status`, `sales_count`) VALUES (33, 20, 'Men\'s Waterproof Large Capacity Fanny Pack, Adjustable Strap For Outdoor Activities, Travel Running, Hiking, And Cycling', '', '0.99', 'Men\'s accesories', 'affiliate', NULL, '[\"/uploads/products/1763851494821-S75f5f5b9d7064c06bb5fa978a9aa92fej.jpg\",\"/uploads/products/1763851494822-S07f040daedc140a4bf5b51bfa0f6e1e4T.png\",\"/uploads/products/1763851494823-S7b3301f42369441aa90ac715691c0b6aK.png\"]', 'https://s.click.aliexpress.com/e/_c4UHDZOl', NULL, NULL, NULL, NULL, '2025-11-22 22:44:54', 'paystack', '0.00', 0, 'active', 0);
INSERT INTO `products` (`id`, `user_id`, `title`, `description`, `price`, `category`, `type`, `file_path`, `images`, `affiliate_link`, `delivery_type`, `delivery_locations`, `delivery_fee`, `payment_option`, `created_at`, `seller_payment_provider`, `rating`, `review_count`, `status`, `sales_count`) VALUES (34, 20, '180ML Mini Air Humidifier USB Electric Aroma Diffuser Essential Oil Purifier Aromatherapy Mist Maker Lights For Car Home Bedroom', '', '0.99', 'Home Appliances', 'affiliate', NULL, '[\"/uploads/products/1763851674697-S18dba0242d424385ad09d5bd5af80ebcs.jpg\",\"/uploads/products/1763851674699-Sa9f91219549045189b133a6635becd818.jpg\",\"/uploads/products/1763851674701-S110db4df6d3a4cd6892ede566abdbcbd0.jpg\"]', 'https://s.click.aliexpress.com/e/_c3Q5ApFn', NULL, NULL, NULL, NULL, '2025-11-22 22:47:54', 'paystack', '4.00', 1, 'active', 0);
INSERT INTO `products` (`id`, `user_id`, `title`, `description`, `price`, `category`, `type`, `file_path`, `images`, `affiliate_link`, `delivery_type`, `delivery_locations`, `delivery_fee`, `payment_option`, `created_at`, `seller_payment_provider`, `rating`, `review_count`, `status`, `sales_count`) VALUES (37, 22, 'photoshop brushes', 'it\' a  top tier product', '13.00', 'Men\'s accesories', 'physical', NULL, '[\"/uploads/products/1766912280335-S75f5f5b9d7064c06bb5fa978a9aa92fej.jpg\",\"/uploads/products/1766912280347-S07f040daedc140a4bf5b51bfa0f6e1e4T.png\",\"/uploads/products/1766912280386-S7b3301f42369441aa90ac715691c0b6aK.png\"]', NULL, 'pickup', NULL, NULL, 'pay_on_delivery', '2025-12-28 08:58:00', 'flutterwave', '4.00', 1, 'active', 0);

INSERT INTO `reviews` (`id`, `user_id`, `product_id`, `rating`, `comment`, `created_at`) VALUES (1, 22, 2, 5, 'it\'s great', '2025-12-20 22:15:25');
INSERT INTO `reviews` (`id`, `user_id`, `product_id`, `rating`, `comment`, `created_at`) VALUES (2, 22, 34, 4, 'it\'s nice', '2025-12-20 22:15:53');
INSERT INTO `reviews` (`id`, `user_id`, `product_id`, `rating`, `comment`, `created_at`) VALUES (3, 22, 13, 4, 'it\'s the best', '2025-12-20 22:16:36');
INSERT INTO `reviews` (`id`, `user_id`, `product_id`, `rating`, `comment`, `created_at`) VALUES (4, 21, 2, 4, 'i love it', '2025-12-20 22:17:43');
INSERT INTO `reviews` (`id`, `user_id`, `product_id`, `rating`, `comment`, `created_at`) VALUES (5, 22, 37, 4, 'good', '2025-12-28 09:24:41');

-- Table is empty

-- Table is empty

-- Table is empty

-- Table is empty

-- Table is empty

-- Table is empty

-- Table is empty

INSERT INTO `service_subscriptions` (`id`, `user_id`, `service_id`, `trial_started_at`, `trial_ends_at`, `status`, `created_at`) VALUES (6, 21, 1, '2025-11-26 23:00:00', '2026-02-24 23:00:00', 'active', '2025-11-27 17:46:26');
INSERT INTO `service_subscriptions` (`id`, `user_id`, `service_id`, `trial_started_at`, `trial_ends_at`, `status`, `created_at`) VALUES (7, 20, 2, '2025-11-27 23:00:00', '2026-02-25 23:00:00', 'active', '2025-11-28 11:44:19');
INSERT INTO `service_subscriptions` (`id`, `user_id`, `service_id`, `trial_started_at`, `trial_ends_at`, `status`, `created_at`) VALUES (8, 22, 6, '2025-11-27 23:00:00', '2026-02-25 23:00:00', 'active', '2025-11-28 19:39:36');

INSERT INTO `services` (`id`, `user_id`, `title`, `description`, `price`, `category`, `created_at`, `provider_profile_picture`, `tags`, `delivery_time`) VALUES (1, 21, 'Web designer', 'w34rwrwererev wefwrwr', '255.00', 'consulting', '2025-11-27 17:46:26', NULL, NULL, NULL);
INSERT INTO `services` (`id`, `user_id`, `title`, `description`, `price`, `category`, `created_at`, `provider_profile_picture`, `tags`, `delivery_time`) VALUES (2, 20, 'Web designer', 'eqdwefwer vegfgererg bdtgefeg', '23.00', 'consulting', '2025-11-28 11:44:19', NULL, NULL, NULL);
INSERT INTO `services` (`id`, `user_id`, `title`, `description`, `price`, `category`, `created_at`, `provider_profile_picture`, `tags`, `delivery_time`) VALUES (3, 20, 'Web designer', 'eqdwefwer vegfgererg bdtgefeg', '23.00', 'consulting', '2025-11-28 11:44:55', NULL, NULL, NULL);
INSERT INTO `services` (`id`, `user_id`, `title`, `description`, `price`, `category`, `created_at`, `provider_profile_picture`, `tags`, `delivery_time`) VALUES (4, 20, 'Web designer', 'rdjbgjsfb wbfsjfbs wufjfwfb', '33.00', 'Programming', '2025-11-28 14:58:32', NULL, NULL, NULL);
INSERT INTO `services` (`id`, `user_id`, `title`, `description`, `price`, `category`, `created_at`, `provider_profile_picture`, `tags`, `delivery_time`) VALUES (5, 20, 'Web designer', 'vyuufydfx bdtytydyufyu', '23.00', 'Programming', '2025-11-28 15:34:49', NULL, NULL, NULL);
INSERT INTO `services` (`id`, `user_id`, `title`, `description`, `price`, `category`, `created_at`, `provider_profile_picture`, `tags`, `delivery_time`) VALUES (6, 22, 'Web designer', 'bsrfefedfedfede fsvse', '134.00', 'Graphic designer', '2025-11-28 19:39:36', '/uploads/profiles/profile-1764607080388-Poster_Design_Laptop_Wallpaper_Enhance_the_look_of___.jpg', NULL, NULL);
INSERT INTO `services` (`id`, `user_id`, `title`, `description`, `price`, `category`, `created_at`, `provider_profile_picture`, `tags`, `delivery_time`) VALUES (7, 22, 'Graphic designer', 'i offer top tier services to my clients', '300.00', 'Writing', '2025-12-03 13:52:02', '/uploads/profiles/profile-1764607080388-Poster_Design_Laptop_Wallpaper_Enhance_the_look_of___.jpg', NULL, NULL);
INSERT INTO `services` (`id`, `user_id`, `title`, `description`, `price`, `category`, `created_at`, `provider_profile_picture`, `tags`, `delivery_time`) VALUES (8, 22, 'Graphic designer', 'i am a ery good programmer', '58.00', 'Programming', '2025-12-03 16:04:42', '/uploads/profiles/profile-1764607080388-Poster_Design_Laptop_Wallpaper_Enhance_the_look_of___.jpg', NULL, NULL);
INSERT INTO `services` (`id`, `user_id`, `title`, `description`, `price`, `category`, `created_at`, `provider_profile_picture`, `tags`, `delivery_time`) VALUES (9, 22, 'Web designer', 'sbjkf aejbnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnlllllllllllllllllllllllllllllllllllllllllll', '123.00', 'Graphic designer', '2025-12-03 21:12:44', '/uploads/profiles/profile-1764607080388-Poster_Design_Laptop_Wallpaper_Enhance_the_look_of___.jpg', NULL, NULL);
INSERT INTO `services` (`id`, `user_id`, `title`, `description`, `price`, `category`, `created_at`, `provider_profile_picture`, `tags`, `delivery_time`) VALUES (10, 22, 'designer', 'i love to offer to tier services to people', '123.00', 'Marketing', '2025-12-04 10:43:40', '/uploads/profiles/profile-1764607080388-Poster_Design_Laptop_Wallpaper_Enhance_the_look_of___.jpg', NULL, NULL);
INSERT INTO `services` (`id`, `user_id`, `title`, `description`, `price`, `category`, `created_at`, `provider_profile_picture`, `tags`, `delivery_time`) VALUES (11, 22, 'Graphic designer', 'i\'m very good at my job', '233.00', 'Social Media', '2025-12-04 11:30:58', '/uploads/profiles/profile-1764607080388-Poster_Design_Laptop_Wallpaper_Enhance_the_look_of___.jpg', NULL, NULL);
INSERT INTO `services` (`id`, `user_id`, `title`, `description`, `price`, `category`, `created_at`, `provider_profile_picture`, `tags`, `delivery_time`) VALUES (14, 22, 'Web designer', 'Are you looking for a high-quality, visually stunning, and fully responsive website that represents your brand professionally and drives real results?\nYou’re in the right place.\n\nI am a professional Web Designer specializing in creating modern, clean, and user-friendly websites that help businesses grow, attract customers, and convert visitors into paying clients. Whether you’re a startup, entrepreneur, content creator, or established brand, I design websites tailored specifically to your needs and goals.', '433.00', 'Graphic designer', '2025-12-04 11:41:20', '/uploads/profiles/profile-1764607080388-Poster_Design_Laptop_Wallpaper_Enhance_the_look_of___.jpg', NULL, NULL);
INSERT INTO `services` (`id`, `user_id`, `title`, `description`, `price`, `category`, `created_at`, `provider_profile_picture`, `tags`, `delivery_time`) VALUES (15, 22, 'Graphic designer', 'Are you looking for a high-quality, visually stunning, and fully responsive website that represents your brand professionally and drives real results?\nYou’re in the right place.\n\nI am a professional Web Designer specializing in creating modern, clean, and user-friendly websites that help businesses grow, attract customers, and convert visitors into paying clients. Whether you’re a startup, entrepreneur, content creator, or established brand, I design websites tailored specifically to your needs and goals.', '44.00', 'Marketing', '2025-12-04 12:00:30', '/uploads/profiles/profile-1764607080388-Poster_Design_Laptop_Wallpaper_Enhance_the_look_of___.jpg', NULL, NULL);
INSERT INTO `services` (`id`, `user_id`, `title`, `description`, `price`, `category`, `created_at`, `provider_profile_picture`, `tags`, `delivery_time`) VALUES (16, 22, 'Graphic designer', 'Are you looking for a high-quality, visually stunning, and fully responsive website that represents your brand professionally and drives real results?\nYou’re in the right place.\n\nI am a professional Web Designer specializing in creating modern, clean, and user-friendly websites that help businesses grow, attract customers, and convert visitors into paying clients. Whether you’re a startup, entrepreneur, content creator, or established brand, I design websites tailored specifically to your needs and goals.', '333.00', 'consulting', '2025-12-04 12:01:06', '/uploads/profiles/profile-1764607080388-Poster_Design_Laptop_Wallpaper_Enhance_the_look_of___.jpg', NULL, NULL);
INSERT INTO `services` (`id`, `user_id`, `title`, `description`, `price`, `category`, `created_at`, `provider_profile_picture`, `tags`, `delivery_time`) VALUES (17, 22, 'Graphic designer', 'Are you looking for a high-quality, visually stunning, and fully responsive website that represents your brand professionally and drives real results?\nYou’re in the right place.\n\nI am a professional Web Designer specializing in creating modern, clean, and user-friendly websites that help businesses grow, attract customers, and convert visitors into paying clients. Whether you’re a startup, entrepreneur, content creator, or established brand, I design websites tailored specifically to your needs and goals.', '455.00', 'Marketing', '2025-12-04 12:04:06', '/uploads/profiles/profile-1764607080388-Poster_Design_Laptop_Wallpaper_Enhance_the_look_of___.jpg', NULL, NULL);
INSERT INTO `services` (`id`, `user_id`, `title`, `description`, `price`, `category`, `created_at`, `provider_profile_picture`, `tags`, `delivery_time`) VALUES (18, 22, 'Graphic designer', 'Are you looking for a high-quality, visually stunning, and fully responsive website that represents your brand professionally and drives real results?\nYou’re in the right place.\n\nI am a professional Web Designer specializing in creating modern, clean, and user-friendly websites that help businesses grow, attract customers, and convert visitors into paying clients. Whether you’re a startup, entrepreneur, content creator, or established brand, I design websites tailored specifically to your needs and goals.', '122.00', 'Programming', '2025-12-04 12:49:37', '/uploads/profiles/profile-1764607080388-Poster_Design_Laptop_Wallpaper_Enhance_the_look_of___.jpg', NULL, NULL);
INSERT INTO `services` (`id`, `user_id`, `title`, `description`, `price`, `category`, `created_at`, `provider_profile_picture`, `tags`, `delivery_time`) VALUES (19, 22, 'Web designer', 'Are you looking for a high-quality, visually stunning, and fully responsive website that represents your brand professionally and drives real results?\nYou’re in the right place.\n\nI am a professional Web Designer specializing in creating modern, clean, and user-friendly websites that help businesses grow, attract customers, and convert visitors into paying clients. Whether you’re a startup, entrepreneur, content creator, or established brand, I design websites tailored specifically to your needs and goals.', '123.00', 'Social Media', '2025-12-04 12:55:16', '/uploads/profiles/profile-1764607080388-Poster_Design_Laptop_Wallpaper_Enhance_the_look_of___.jpg', NULL, NULL);
INSERT INTO `services` (`id`, `user_id`, `title`, `description`, `price`, `category`, `created_at`, `provider_profile_picture`, `tags`, `delivery_time`) VALUES (20, 22, 'Graphic designer', 'Are you looking for a high-quality, visually stunning, and fully responsive website that represents your brand professionally and drives real results?\nYou’re in the right place.\n\nI am a professional Web Designer specializing in creating modern, clean, and user-friendly websites that help businesses grow, attract customers, and convert visitors into paying clients. Whether you’re a startup, entrepreneur, content creator, or established brand, I design websites tailored specifically to your needs and goals.', '1233.00', 'consulting', '2025-12-04 13:11:18', '/uploads/profiles/profile-1764607080388-Poster_Design_Laptop_Wallpaper_Enhance_the_look_of___.jpg', NULL, NULL);
INSERT INTO `services` (`id`, `user_id`, `title`, `description`, `price`, `category`, `created_at`, `provider_profile_picture`, `tags`, `delivery_time`) VALUES (21, 22, 'Web designer', 'Are you looking for a high-quality, visually stunning, and fully responsive website that represents your brand professionally and drives real results?\nYou’re in the right place.\n\nI am a professional Web Designer specializing in creating modern, clean, and user-friendly websites that help businesses grow, attract customers, and convert visitors into paying clients. Whether you’re a startup, entrepreneur, content creator, or established brand, I design websites tailored specifically to your needs and goals.', '233.00', 'consulting', '2025-12-04 14:31:14', '/uploads/profiles/profile-1764607080388-Poster_Design_Laptop_Wallpaper_Enhance_the_look_of___.jpg', NULL, NULL);
INSERT INTO `services` (`id`, `user_id`, `title`, `description`, `price`, `category`, `created_at`, `provider_profile_picture`, `tags`, `delivery_time`) VALUES (22, 22, 'Web designer', 'Are you looking for a high-quality, visually stunning, and fully responsive website that represents your brand professionally and drives real results?\nYou’re in the right place.\n\nI am a professional Web Designer specializing in creating modern, clean, and user-friendly websites that help businesses grow, attract customers, and convert visitors into paying clients. Whether you’re a startup, entrepreneur, content creator, or established brand, I design websites tailored specifically to your needs and goals.', '22.00', 'Graphic designer', '2025-12-04 14:50:13', '/uploads/profiles/profile-1764607080388-Poster_Design_Laptop_Wallpaper_Enhance_the_look_of___.jpg', NULL, NULL);
INSERT INTO `services` (`id`, `user_id`, `title`, `description`, `price`, `category`, `created_at`, `provider_profile_picture`, `tags`, `delivery_time`) VALUES (55, 22, 'Web designer', 'i love technology', '12.00', 'Technology', '2025-12-25 22:57:59', '/uploads/profiles/profile-1765047122309-ChatGPT_Image_Nov_30__2025__06_47_02_PM.png', NULL, NULL);

-- Table is empty

-- Table is empty

INSERT INTO `users` (`id`, `username`, `email`, `password`, `role`, `created_at`, `verified`, `verify_token`, `reset_token`, `reset_expires`, `flutterwave_account`, `paystack_account`, `daily_delete_count`, `last_delete_date`, `delete_warning_flag`, `active`) VALUES (8, 'taofeeq', NULL, '$2a$10$ZINR7uK9eE6PJfwaE0rgIuK1atBTpn9XC4DxAMiKwv8NpSSO24zs.', 'user', '2025-09-24 22:43:10', 0, NULL, NULL, NULL, NULL, NULL, 0, NULL, 0, 1);
INSERT INTO `users` (`id`, `username`, `email`, `password`, `role`, `created_at`, `verified`, `verify_token`, `reset_token`, `reset_expires`, `flutterwave_account`, `paystack_account`, `daily_delete_count`, `last_delete_date`, `delete_warning_flag`, `active`) VALUES (12, 'hgfgdfgsd', NULL, '$2a$10$2uCeM.vxcJ/rF2ZVu5ohfubrJLeQd3/k/aHAeNgB2ELUE5Wbj4FKK', 'user', '2025-09-24 22:52:36', 0, NULL, NULL, NULL, NULL, NULL, 0, NULL, 0, 1);
INSERT INTO `users` (`id`, `username`, `email`, `password`, `role`, `created_at`, `verified`, `verify_token`, `reset_token`, `reset_expires`, `flutterwave_account`, `paystack_account`, `daily_delete_count`, `last_delete_date`, `delete_warning_flag`, `active`) VALUES (13, 'dafaeda', NULL, '$2a$10$mxtXS.cKzxQSKozl8D4C1.V1FiVmvtc.4SAvGNdMxls2OvK0Eg1IC', 'user', '2025-09-24 22:53:19', 0, NULL, NULL, NULL, NULL, NULL, 0, NULL, 0, 1);
INSERT INTO `users` (`id`, `username`, `email`, `password`, `role`, `created_at`, `verified`, `verify_token`, `reset_token`, `reset_expires`, `flutterwave_account`, `paystack_account`, `daily_delete_count`, `last_delete_date`, `delete_warning_flag`, `active`) VALUES (14, 'tqofh', NULL, '$2a$10$BPEIqu40x.GZtQRceP//WesBARLpHY5tKXpi7v0IJR/acdBHczJC6', 'user', '2025-09-25 19:15:48', 0, NULL, NULL, NULL, NULL, NULL, 0, NULL, 0, 1);
INSERT INTO `users` (`id`, `username`, `email`, `password`, `role`, `created_at`, `verified`, `verify_token`, `reset_token`, `reset_expires`, `flutterwave_account`, `paystack_account`, `daily_delete_count`, `last_delete_date`, `delete_warning_flag`, `active`) VALUES (15, 'ryttgtdg', NULL, '$2a$10$1uc0HGyW7DlxhqVOepEJM.Ig9THlAcDYTyBbi4OWH3kvTdgeGIZva', 'user', '2025-09-25 19:16:56', 0, NULL, NULL, NULL, NULL, NULL, 0, NULL, 0, 1);
INSERT INTO `users` (`id`, `username`, `email`, `password`, `role`, `created_at`, `verified`, `verify_token`, `reset_token`, `reset_expires`, `flutterwave_account`, `paystack_account`, `daily_delete_count`, `last_delete_date`, `delete_warning_flag`, `active`) VALUES (16, 'dummy', 'harunaadeniyi001@gmail.com', '$2a$10$3BsDaUBQoQCZjlYgSrzLfe2DAMqU0W0h4L5rp3zN48IgSHUdHiLAO', 'user', '2025-10-05 17:09:08', 0, '3716843aef77fa1c34519c6d3c7ce280a3e8eeabe64c0fe574981dbe3e7ad36d', NULL, NULL, NULL, NULL, 0, NULL, 0, 1);
INSERT INTO `users` (`id`, `username`, `email`, `password`, `role`, `created_at`, `verified`, `verify_token`, `reset_token`, `reset_expires`, `flutterwave_account`, `paystack_account`, `daily_delete_count`, `last_delete_date`, `delete_warning_flag`, `active`) VALUES (17, 'dummy2', 'taofeeqj827@gmail.com', '$2a$10$T4MtxYmngaLoYJYvbPZz6e/bZbCBGA73ZinHBe6dpI8DDpMw/SLP6', 'user', '2025-10-05 17:16:13', 0, '97d5b2899ab34afdd38d5fb5a036231598023b2c7b7eeddcf3367c04661d2f27', NULL, NULL, NULL, NULL, 0, NULL, 0, 1);
INSERT INTO `users` (`id`, `username`, `email`, `password`, `role`, `created_at`, `verified`, `verify_token`, `reset_token`, `reset_expires`, `flutterwave_account`, `paystack_account`, `daily_delete_count`, `last_delete_date`, `delete_warning_flag`, `active`) VALUES (19, 'dammmu', 'jimohtaofeeq619@gmail.com', '$2a$10$JFUVEep43gdPY5tiSMWHOuBfkASDkHNxF1nAVMfLhUhKmsWg0FV42', 'user', '2025-10-06 22:32:28', 0, '1dd037c8bba3cfb5c7d46feacf7f6b6b204801cc71a7782edd2531a36dfd4a56', NULL, NULL, NULL, NULL, 0, NULL, 0, 1);
INSERT INTO `users` (`id`, `username`, `email`, `password`, `role`, `created_at`, `verified`, `verify_token`, `reset_token`, `reset_expires`, `flutterwave_account`, `paystack_account`, `daily_delete_count`, `last_delete_date`, `delete_warning_flag`, `active`) VALUES (20, 'Core insight', 'jimohtaofeeq39@gmail.com', '$2a$10$mH2N7ULUukDWwF2WX9bVT.r0IdN6kVB2TbsJPxVrmh4F5pZwVx.0W', 'admin', '2025-10-07 15:55:57', 1, NULL, NULL, NULL, NULL, NULL, 0, NULL, 0, 1);
INSERT INTO `users` (`id`, `username`, `email`, `password`, `role`, `created_at`, `verified`, `verify_token`, `reset_token`, `reset_expires`, `flutterwave_account`, `paystack_account`, `daily_delete_count`, `last_delete_date`, `delete_warning_flag`, `active`) VALUES (21, 'Testers', 'dicksonanderson2004@gmail.com', '$2a$10$MscDrxldE.fJgKHc6VybVOTOhcGuaVxKU.MRIwGCSAqSpNZ.2vS1u', 'client', '2025-11-19 19:56:53', 1, NULL, NULL, NULL, NULL, NULL, 0, NULL, 0, 1);
INSERT INTO `users` (`id`, `username`, `email`, `password`, `role`, `created_at`, `verified`, `verify_token`, `reset_token`, `reset_expires`, `flutterwave_account`, `paystack_account`, `daily_delete_count`, `last_delete_date`, `delete_warning_flag`, `active`) VALUES (22, 'Prince', 'princeanderson938@gmail.com', '$2a$10$QpJbWK3kxn4t0PYvtmX.1e1vYQ4paRwdOskPp.EtXMbcl01D7JuA6', 'freelancer', '2025-11-28 15:49:54', 1, NULL, NULL, NULL, NULL, NULL, 0, NULL, 0, 1);


