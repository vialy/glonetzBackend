const admin = (req, res, next) => {
  // Vérifier si l'utilisateur est un admin
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Access denied. Admin only.' });
  }
  next();
};

module.exports = admin; 