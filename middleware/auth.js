const jwt = require('jsonwebtoken');
require('dotenv').config();

const auth = (roles = []) => {
  return (req, res, next) => {
    const token = req.header('Authorization')?.replace('Bearer ', '');

    if (!token) {
      return res.status(401).json({ error: 'Access denied. No token provided.' });
    }

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      req.user = decoded; // Attach user data to request

      // Check if user role is allowed
      if (roles.length && !roles.includes(decoded.role)) {
        return res.status(403).json({ error: 'Access denied. Insufficient permissions.' });
      }

      next();
    } catch (err) {
      res.status(400).json({ error: 'Invalid token.' });
    }
  };
};

module.exports = auth;