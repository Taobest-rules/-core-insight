-- fix-database.sql
USE core_insight;

-- Drop existing tables
DROP TABLE IF EXISTS courses;
DROP TABLE IF EXISTS users;

-- Create correct users table
CREATE TABLE users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(100) UNIQUE NOT NULL,
    email VARCHAR(255),
    password VARCHAR(255) NOT NULL,
    role ENUM('admin', 'user') DEFAULT 'user',
    reset_token VARCHAR(255) NULL,
    reset_token_expiry DATETIME NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create correct courses table
CREATE TABLE courses (
    id INT AUTO_INCREMENT PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    file_path VARCHAR(500),
    price DECIMAL(10,2) DEFAULT 0.00,
    type ENUM('free', 'paid') DEFAULT 'free',
    user_id INT NOT NULL,
    author VARCHAR(100) NOT NULL,
    flw_tx_ref VARCHAR(255),
    flw_transaction_id VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Create admin user
INSERT INTO users (username, email, password, role) 
VALUES ('admin', 'admin@coreinsight.com', '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'admin');

SELECT 'Database fixed successfully!' as message;
SELECT * FROM users;