#!/bin/bash
# 认证 API 快速测试脚本
# 使用方法: bash scripts/test-auth-api.sh

set -e

# 颜色定义
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 配置
API_BASE="${API_BASE:-http://localhost:3000}"
TEST_EMAIL="test-$(date +%s)@gmail.com"
TEST_PASSWORD="Test1234"
TEST_USERNAME="testuser"

echo -e "${YELLOW}🧪 开始测试认证 API...${NC}\n"

# 测试 1: 初始化数据库
echo -e "${YELLOW}📊 测试 1: 初始化数据库${NC}"
INIT_RESPONSE=$(curl -s -X POST "$API_BASE/api/admin/init-db" \
  -H "Content-Type: application/json" \
  -d "{\"token\": \"$INIT_DB_TOKEN\"}")

if echo "$INIT_RESPONSE" | grep -q '"ok":true'; then
  echo -e "${GREEN}✅ 数据库初始化成功${NC}\n"
else
  echo -e "${RED}❌ 数据库初始化失败: $INIT_RESPONSE${NC}\n"
fi

# 测试 2: 发送验证码
echo -e "${YELLOW}📧 测试 2: 发送验证码到 $TEST_EMAIL${NC}"
CODE_RESPONSE=$(curl -s -X POST "$API_BASE/api/auth/send-code?scene=register" \
  -H "Content-Type: application/json" \
  -d "{\"email\": \"$TEST_EMAIL\"}")

if echo "$CODE_RESPONSE" | grep -q '"ok":true'; then
  echo -e "${GREEN}✅ 验证码发送成功${NC}"
  echo -e "${YELLOW}⏰ 请在 10 分钟内检查邮箱并输入验证码${NC}\n"
  
  # 等待用户输入验证码
  read -p "请输入收到的验证码: " VERIFICATION_CODE
  
  # 测试 3: 注册用户
  echo -e "\n${YELLOW}👤 测试 3: 注册用户${NC}"
  REGISTER_RESPONSE=$(curl -s -X POST "$API_BASE/api/auth/register" \
    -H "Content-Type: application/json" \
    -d "{
      \"username\": \"$TEST_USERNAME\",
      \"email\": \"$TEST_EMAIL\",
      \"password\": \"$TEST_PASSWORD\",
      \"code\": \"$VERIFICATION_CODE\"
    }")
  
  if echo "$REGISTER_RESPONSE" | grep -q '"ok":true'; then
    echo -e "${GREEN}✅ 用户注册成功${NC}"
    USER_ID=$(echo "$REGISTER_RESPONSE" | grep -o '"user_id":"[^"]*"' | cut -d'"' -f4)
    echo -e "${GREEN}   用户 ID: $USER_ID${NC}\n"
  else
    echo -e "${RED}❌ 用户注册失败: $REGISTER_RESPONSE${NC}\n"
  fi
else
  echo -e "${RED}❌ 验证码发送失败: $CODE_RESPONSE${NC}\n"
fi

# 测试 4: 验证码限流测试
echo -e "${YELLOW}⏱️  测试 4: 验证码限流（连续发送）${NC}"
LIMIT_RESPONSE=$(curl -s -X POST "$API_BASE/api/auth/send-code?scene=register" \
  -H "Content-Type: application/json" \
  -d "{\"email\": \"$TEST_EMAIL\"}")

if echo "$LIMIT_RESPONSE" | grep -q '429'; then
  echo -e "${GREEN}✅ 限流机制生效${NC}\n"
else
  echo -e "${YELLOW}⚠️  限流可能未生效（或冷却时间已过）${NC}\n"
fi

echo -e "${GREEN}🎉 测试完成！${NC}"
echo -e "\n${YELLOW}📝 测试总结：${NC}"
echo -e "  - 测试邮箱: $TEST_EMAIL"
echo -e "  - 测试密码: $TEST_PASSWORD"
echo -e "  - API 地址: $API_BASE"
echo -e "\n${YELLOW}💡 提示：${NC}"
echo -e "  1. 检查 Supabase Dashboard 中的用户列表"
echo -e "  2. 检查 email_otps 表中的记录"
echo -e "  3. 尝试使用测试账号登录应用"
