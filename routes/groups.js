const express = require('express');
const Group = require('../models/Group');
const Certificate = require('../models/Certificate');
const auth = require('../middleware/auth');
const admin = require('../middleware/admin');
const router = express.Router();

// Créer un nouveau groupe (admin seulement)
router.post('/', [auth, admin], async (req, res) => {
  try {
    const { level, startDate, timeSlot, name } = req.body;

    // Vérifier que tous les champs requis sont présents
    if (!level || !startDate || !timeSlot || !name) {
      return res.status(400).json({ error: 'Tous les champs sont requis' });
    }

    // Créer un nouvel objet Date à partir de la chaîne de date
    const parsedDate = new Date(startDate);
    if (isNaN(parsedDate.getTime())) {
      return res.status(400).json({ error: 'Format de date invalide' });
    }

    const group = new Group({
      level,
      startDate: parsedDate,
      timeSlot,
      name,
      createdBy: req.user._id
    });

    await group.save();
    res.status(201).json(group);
  } catch (error) {
    console.error('Erreur lors de la création du groupe:', error);
    res.status(500).json({ error: error.message });
  }
});

// Obtenir tous les groupes
router.get('/', auth, async (req, res) => {
  try {
    const groups = await Group.find()
      .sort({ startDate: -1, level: 1 })
      .populate('createdBy', 'username');
    res.json(groups);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Obtenir un groupe spécifique
router.get('/:id', auth, async (req, res) => {
  try {
    const group = await Group.findById(req.params.id)
      .populate('createdBy', 'username');
    if (!group) {
      return res.status(404).json({ error: 'Groupe non trouvé' });
    }
    res.json(group);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Modifier un groupe (admin seulement)
router.put('/:id', [auth, admin], async (req, res) => {
  try {
    const { level, startDate, timeSlot, name } = req.body;
    
    const group = await Group.findById(req.params.id);
    if (!group) {
      return res.status(404).json({ error: 'Groupe non trouvé' });
    }

    // Si la date de début est modifiée, vérifier s'il existe des certificats
    if (startDate && new Date(startDate).getTime() !== new Date(group.startDate).getTime()) {
      const certificatesCount = await Certificate.countDocuments({ groupCode: group.groupCode });
      if (certificatesCount > 0) {
        return res.status(400).json({ 
          error: `Impossible de modifier la date de début car ${certificatesCount} certificat(s) sont associés à ce groupe. Veuillez créer un nouveau groupe si nécessaire.`
        });
      }
    }

    group.level = level;
    group.startDate = startDate;
    group.timeSlot = timeSlot;
    group.name = name;

    await group.save();
    res.json(group);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Supprimer un groupe (admin seulement)
router.delete('/:id', [auth, admin], async (req, res) => {
  try {
    const group = await Group.findByIdAndDelete(req.params.id);
    if (!group) {
      return res.status(404).json({ error: 'Groupe non trouvé' });
    }
    res.json({ message: 'Groupe supprimé avec succès' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router; 