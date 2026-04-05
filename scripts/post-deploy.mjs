#!/usr/bin/env node
/**
 * 部署后自动初始化数据库
 * Vercel 构建完成后自动执行
 */
import fetch from 'node-fetch';

const API_URL = process.env.VERCEL_URL 
  ? `https://${process.env.VERCEL_URL}` 
  : process.env.VITE_AUTH_API_BASE || 'http://localhost:3000';

const INIT_TOKEN = process.env.INIT_DB_TOKEN;

async function initDatabase() {
  if (!INIT_TOKEN) {
    console.log('⚠️  INIT_DB_TOKEN not found, skipping database init');
    return;
  }

  console.log('🔧 Initializing database...');
  console.log(`📍 API URL: ${API_URL}`);

  try {
    const response = await fetch(`${API_URL}/api/admin/init-db`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: INIT_TOKEN })
    });

    const data = await response.json();
    
    if (response.ok) {
      console.log('✅ Database initialized successfully');
      console.log('📊 Tables created: email_otps');
    } else {
      console.error('❌ Database init failed:', data.message);
      process.exit(1);
    }
  } catch (error) {
    console.error('❌ Database init error:', error.message);
    console.error('💡 This is expected on first build. Tables will be created on first API call.');
  }
}

initDatabase();
