const fetch = require('node-fetch');
const express = require('express');
const cors = require('cors');
const app = express();

app.use(cors({ origin: '*' }));
app.use(express.json());

const DEEPSEEK_API_KEY = "sk-48ae6efed10e46c0a7868bef9ca52b6b";
const DEEPSEEK_API_URL = "https://api.deepseek.com/v1/chat/completions";

app.post('/api/chat', async (req, res) => {
  try {
    const { prompt } = req.body;
    if (!prompt || prompt.trim() === '') {
      return res.status(400).json({ error: '请输入有效内容' });
    }

    console.log(`[请求] 用户提问：${prompt.substring(0, 50)}`);

    const deepSeekRes = await fetch(DEEPSEEK_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${DEEPSEEK_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: "deepseek-chat",
        messages: [
          { role: "system", content: "你是古建筑专家小建，解答专业、简洁、友好，回复控制在200字以内" },
          { role: "user", content: prompt.trim() }
        ],
        temperature: 0.7,
        max_tokens: 1000
      })
    });

    // 获取原始响应文本
    const responseText = await deepSeekRes.text();

    if (!deepSeekRes.ok) {
      console.error(`❌ DeepSeek 返回错误 [${deepSeekRes.status}]: ${responseText}`);
      return res.status(deepSeekRes.status).json({
        error: 'AI 接口调用失败',
        detail: responseText,
        status: deepSeekRes.status
      });
    }

    // 尝试解析 JSON
    let data;
    try {
      data = JSON.parse(responseText);
    } catch (parseErr) {
      console.error(`❌ 解析 DeepSeek 响应失败:`, parseErr.message, '原始响应:', responseText);
      return res.status(500).json({ error: 'AI 返回数据格式错误' });
    }

    console.log(`✅ AI 回复：${data.choices?.[0]?.message?.content?.substring(0, 50)}...`);
    res.json(data);

  } catch (err) {
    console.error(`🔥 服务器内部错误:`, err.stack);
    res.status(500).json({ error: '服务器错误', message: err.message });
  }
});

app.listen(3000, () => {
  console.log('✅ 后端服务启动成功：http://localhost:3000');
});
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');

const JWT_SECRET = 'your-secret-key-change-in-production'; 
const USERS_FILE = path.join(__dirname, 'users.json');

// 读取用户数据
function readUsers() {
  try {
    let users = JSON.parse(fs.readFileSync(USERS_FILE));
    users = users.map(user => ({
      friends: [],
      friendRequests: [],
      ...user
    }));
    return users;
  } catch {
    return [];
  }
}

// 写入用户数据
function writeUsers(users) {
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
}

// 注册接口
app.post('/api/register', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: '用户名和密码不能为空' });
    }

    const users = readUsers();
    // 检查用户名是否已存在
    if (users.find(u => u.username === username)) {
      return res.status(400).json({ error: '用户名已存在' });
    }

    // 加密密码
    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = {
       id: Date.now().toString(),
       username,
       password: hashedPassword,
       friends: [],
       friendRequests: []
    };
    users.push(newUser);
    writeUsers(users);

    // 生成 token
    const token = jwt.sign({ userId: newUser.id, username }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ success: true, token, username });
  } catch (err) {
    console.error('注册错误:', err);
    res.status(500).json({ error: '服务器错误' });
  }
});

// 登录接口
app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: '用户名和密码不能为空' });
    }

    const users = readUsers();
    const user = users.find(u => u.username === username);
    if (!user) {
      return res.status(401).json({ error: '用户名或密码错误' });
    }

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      return res.status(401).json({ error: '用户名或密码错误' });
    }

    const token = jwt.sign({ userId: user.id, username }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ success: true, token, username });
  } catch (err) {
    console.error('登录错误:', err);
    res.status(500).json({ error: '服务器错误' });
  }
});

// 验证 token 的中间件（用于保护需要登录的接口）
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; 
  if (!token) return res.sendStatus(401);

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.sendStatus(403);
    req.user = user;
    next();
  });
}

// 示例：获取当前用户信息
app.get('/api/me', authenticateToken, (req, res) => {
  res.json({ username: req.user.username });
});
// 验证 token 中间件
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.sendStatus(401);
  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.sendStatus(403);
    req.user = user; // { userId, username }
    next();
  });
}

// 搜索用户（根据用户名关键词）
app.get('/api/users/search', authenticateToken, (req, res) => {
  const keyword = req.query.q;
  if (!keyword) return res.json([]);
  const users = readUsers();
  const results = users
    .filter(u => u.username.includes(keyword) && u.id !== req.user.userId)
    .map(u => ({ id: u.id, username: u.username }));
  res.json(results);
});

// 发送好友请求
app.post('/api/friend-request/send', authenticateToken, (req, res) => {
  const { targetUserId } = req.body;
  if (!targetUserId) return res.status(400).json({ error: '缺少目标用户ID' });
  const users = readUsers();
  const currentUser = users.find(u => u.id === req.user.userId);
  const targetUser = users.find(u => u.id === targetUserId);
  if (!targetUser) return res.status(404).json({ error: '用户不存在' });

  // 检查是否已经是好友
  if (currentUser.friends && currentUser.friends.includes(targetUserId)) {
    return res.status(400).json({ error: '你们已经是好友了' });
  }
  // 检查是否已发送过请求
  if (targetUser.friendRequests && targetUser.friendRequests.some(r => r.from === req.user.userId && r.status === 'pending')) {
    return res.status(400).json({ error: '好友请求已发送，请勿重复发送' });
  }

  // 初始化数组（如果不存在）
  if (!targetUser.friendRequests) targetUser.friendRequests = [];
  // 添加请求到目标用户的请求列表
  targetUser.friendRequests.push({ from: req.user.userId, status: 'pending', timestamp: Date.now() });
  writeUsers(users);
  res.json({ success: true, message: '好友请求已发送' });
});

// 获取当前用户的好友列表
app.get('/api/friends', authenticateToken, (req, res) => {
  const users = readUsers();
  const currentUser = users.find(u => u.id === req.user.userId);
  const friendIds = currentUser.friends || [];
  const friends = users.filter(u => friendIds.includes(u.id)).map(u => ({ id: u.id, username: u.username }));
  res.json(friends);
});

// 获取待处理的好友请求（别人发给我的）
app.get('/api/friend-requests', authenticateToken, (req, res) => {
  const users = readUsers();
  const currentUser = users.find(u => u.id === req.user.userId);
  const requests = (currentUser.friendRequests || []).filter(r => r.status === 'pending');
  // 补充发送者的用户名
  const enriched = requests.map(r => {
    const fromUser = users.find(u => u.id === r.from);
    return { fromUserId: r.from, fromUsername: fromUser ? fromUser.username : '未知', timestamp: r.timestamp };
  });
  res.json(enriched);
});

// 处理好友请求（接受/拒绝）
app.post('/api/friend-request/handle', authenticateToken, (req, res) => {
  const { fromUserId, action } = req.body; // action: 'accept' 或 'reject'
  if (!fromUserId || !['accept', 'reject'].includes(action)) {
    return res.status(400).json({ error: '参数错误' });
  }
  const users = readUsers();
  const currentUser = users.find(u => u.id === req.user.userId);
  const requestIndex = (currentUser.friendRequests || []).findIndex(r => r.from === fromUserId && r.status === 'pending');
  if (requestIndex === -1) {
    return res.status(404).json({ error: '好友请求不存在或已处理' });
  }

  if (action === 'accept') {
    // 双方添加好友
    if (!currentUser.friends) currentUser.friends = [];
    if (!currentUser.friends.includes(fromUserId)) currentUser.friends.push(fromUserId);
    const fromUser = users.find(u => u.id === fromUserId);
    if (fromUser) {
      if (!fromUser.friends) fromUser.friends = [];
      if (!fromUser.friends.includes(req.user.userId)) fromUser.friends.push(req.user.userId);
    }
    // 更新请求状态为 accepted（可选，也可以直接删除）
    currentUser.friendRequests[requestIndex].status = 'accepted';
  } else {
    // 拒绝：直接删除请求或标记为 rejected
    currentUser.friendRequests.splice(requestIndex, 1);
  }

  writeUsers(users);
  res.json({ success: true, message: action === 'accept' ? '已添加好友' : '已拒绝请求' });
});
app.delete('/api/friends/:friendId', authenticateToken, (req, res) => {
  const { friendId } = req.params;
  const users = readUsers();
  const currentUser = users.find(u => u.id === req.user.userId);
  const friendUser = users.find(u => u.id === friendId);
  if (!currentUser || !friendUser) return res.status(404).json({ error: '用户不存在' });

  // 从双方好友列表中移除
  if (currentUser.friends) {
    currentUser.friends = currentUser.friends.filter(id => id !== friendId);
  }
  if (friendUser.friends) {
    friendUser.friends = friendUser.friends.filter(id => id !== req.user.userId);
  }
  writeUsers(users);
  res.json({ success: true });
});
