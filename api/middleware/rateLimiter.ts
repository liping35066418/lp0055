import rateLimit from 'express-rate-limit';

export const globalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    code: 'RATE_LIMIT_EXCEEDED',
    message: '请求过于频繁，请稍后再试（每分钟最多30次）',
  },
});

export const repairLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    return req.ip || 'unknown';
  },
  message: {
    code: 'RATE_LIMIT_EXCEEDED',
    message: '修复请求过于频繁，请稍后再试（每IP每小时最多100次）',
  },
});
