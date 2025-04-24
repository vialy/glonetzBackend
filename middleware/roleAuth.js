const isAdmin = (req, res, next) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Accès refusé. Réservé aux administrateurs.' });
  }
  next();
};

const isManagerOrAdmin = (req, res, next) => {
  if (!['admin', 'manager'].includes(req.user.role)) {
    return res.status(403).json({ error: 'Accès refusé. Réservé aux managers et administrateurs.' });
  }
  next();
};

const canCreateCertificates = (req, res, next) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Accès refusé. Seuls les administrateurs peuvent créer de nouveaux certificats.' });
  }
  next();
};

const canModifyCertificates = (req, res, next) => {
  if (!['admin', 'manager'].includes(req.user.role)) {
    return res.status(403).json({ error: 'Accès refusé. Vous n\'avez pas les droits pour modifier les certificats.' });
  }
  next();
};

const canViewHistory = (req, res, next) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Accès refusé. L\'historique est réservé aux administrateurs.' });
  }
  next();
};

module.exports = {
  isAdmin,
  isManagerOrAdmin,
  canCreateCertificates,
  canModifyCertificates,
  canViewHistory
}; 