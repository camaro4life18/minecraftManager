#!/usr/bin/env node
/**
 * Initialize the database with default users
 * Run this once to set up the admin and demo user accounts
 */

import bcrypt from 'bcryptjs';
import { initializeDatabase, User, pool } from './database.js';

async function initializeUsers() {
  console.log('🔧 Initializing Minecraft Server Manager database...');
  console.log('');

  try {
    // Initialize database tables
    await initializeDatabase();

    // Create admin user
    const adminExists = await User.findByUsername('admin');
    if (!adminExists) {
      const adminPassword = await bcrypt.hash('admin123', 10);
      await User.create('admin', 'admin@localhost', adminPassword, 'admin');
      console.log('✓ Created admin user');
      console.log('  Username: admin');
      console.log('  Password: admin123');
      console.log('  Role: admin');
    } else {
      console.log('✓ Admin user already exists');
    }

    // Create demo user for your son
    const userExists = await User.findByUsername('user');
    if (!userExists) {
      const userPassword = await bcrypt.hash('user123', 10);
      await User.create('user', 'user@localhost', userPassword, 'user');
      console.log('✓ Created demo user');
      console.log('  Username: user');
      console.log('  Password: user123');
      console.log('  Role: user');
    } else {
      console.log('✓ Demo user already exists');
    }

    console.log('');
    console.log('✅ Database initialization complete!');
    console.log('');
    console.log('📝 Default Accounts:');
    console.log('   Admin: admin / admin123');
    console.log('   User:  user / user123');
    console.log('');
    console.log('🔒 Change the admin password in production!');
    console.log('');
  } catch (error) {
    console.error('❌ Error initializing database:', error);
    process.exit(1);
  } finally {
    // Close the connection pool
    await pool.end();
  }

  process.exit(0);
}

initializeUsers();
