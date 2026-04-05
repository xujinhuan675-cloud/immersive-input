#!/bin/bash
# 初始化数据库表
# 使用方法: bash scripts/init-database.sh [API_URL]
# 示例: bash scripts/init-database.sh https://your-app.vercel.app

set -e

# 颜色定义
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 从 .env 读取配置
if [ -f .env ]; then
    export $(cat .env | grep -v '^#' | xargs)
fi

# API 地址（从参数或环境变量获取）
API_URL="${1:-${VITE_AUTH_API_BASE:-}}"

if [ -z "$API_URL" ]; then
    echo -e "${RED}❌ 错误: 未指定 API 地址${NC}"
    echo -e "${YELLOW}使用方法:${NC}"
    echo -e "  bash scripts/init-database.sh https://your-app.vercel.app"
    echo -e "  或在 .env 中设置 VITE_AUTH_API_BASE"
    exit 1
fi

if [ -z "$INIT_DB_TOKEN" ]; then
    echo -e "${RED}❌ 错误: 未找到 INIT_DB_TOKEN${NC}"
    echo -e "${YELLOW}请在 .env 文件中设置 INIT_DB_TOKEN${NC}"
    exit 1
fi

echo -e "${YELLOW}🔧 正在初始化数据库...${NC}"
echo -e "API 地址: $API_URL"

# 调用初始化接口
RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$API_URL/api/admin/init-db" \
  -H "Content-Type: application/json" \
  -d "{\"token\": \"$INIT_DB_TOKEN\"}")

HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | head -n-1)

if [ "$HTTP_CODE" = "200" ]; then
    echo -e "${GREEN}✅ 数据库初始化成功！${NC}"
    echo -e "${GREEN}响应: $BODY${NC}"
else
    echo -e "${RED}❌ 数据库初始化失败${NC}"
    echo -e "${RED}HTTP 状态码: $HTTP_CODE${NC}"
    echo -e "${RED}响应: $BODY${NC}"
    exit 1
fi
