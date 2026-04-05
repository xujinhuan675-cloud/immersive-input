#!/bin/bash
# 初始化数据库表
# 使用方法: bash scripts/init-database.sh

# 从 .env 读取配置
source .env

# 调用初始化接口
curl -X POST https://your-vercel-domain.vercel.app/api/admin/init-db \
  -H "Content-Type: application/json" \
  -d "{\"token\": \"$INIT_DB_TOKEN\"}"

echo "\n✅ 数据库初始化完成"
