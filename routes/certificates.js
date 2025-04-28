const express = require('express');
const Certificate = require('../models/Certificate');
const auth = require('../middleware/auth');
const { isAdmin, isManagerOrAdmin, canModifyCertificates, canViewHistory, canCreateCertificates } = require('../middleware/roleAuth');
const router = express.Router();
const { generateCertificatePDF } = require('../utils/pdfGenerator');
const fs = require('fs');
const multer = require('multer');
const xlsx = require('xlsx');
const path = require('path');
const Group = require('../models/Group');

// 🔁 Conversion d'une date Excel (numéro de série) en objet Date JavaScript
const excelDateToJSDate = (excelDate) => {
  if (typeof excelDate !== 'number') return null;

  const millisecondsPerDay = 24 * 60 * 60 * 1000;
  const excelEpoch = new Date(1900, 0, 1); // 1er janvier 1900
  const daysSinceExcelEpoch = excelDate - 2; // Correction du bug Excel
  return new Date(excelEpoch.getTime() + daysSinceExcelEpoch * millisecondsPerDay);
};

// 🧠 Fonction de normalisation : accepte Date, string ou numéro Excel
const normalizeDate = (dateValue) => {
  if (!dateValue) return null;

  // Si c'est déjà un objet Date
  if (dateValue instanceof Date) {
    return dateValue;
  }

  // Si c'est un nombre (numéro de série Excel)
  if (typeof dateValue === 'number') {
    if (dateValue > 25569) {
      return excelDateToJSDate(dateValue);
    }
    return null; // trop petit pour être une date valide
  }

  // Si c'est une chaîne de caractères
  if (typeof dateValue === 'string') {
    const formats = [
      'DD.MM.YYYY',
      'YYYY-MM-DD',
      'DD/MM/YYYY',
      'MM/DD/YYYY',
      'YYYY/MM/DD'
    ];

    for (const format of formats) {
      const parts = dateValue.split(/[-./]/);
      if (parts.length !== 3) continue;

      let day, month, year;
      if (format === 'DD.MM.YYYY' || format === 'DD/MM/YYYY') {
        [day, month, year] = parts;
      } else if (format === 'YYYY-MM-DD' || format === 'YYYY/MM/DD') {
        [year, month, day] = parts;
      } else {
        [month, day, year] = parts;
      }

      const jsDate = new Date(year, month - 1, day);
      if (!isNaN(jsDate.getTime())) {
        return jsDate;
      }
    }

    // Tentative finale avec le parser natif
    const parsed = new Date(dateValue);
    if (!isNaN(parsed.getTime())) {
      return parsed;
    }
  }

  return null;
};

// Pour formater une date au format YYYY-MM-DD
const formatDate = (date) => {
  if (!date) return '';
  return date.toISOString().split('T')[0];
};

// Configuration de multer pour le téléchargement de fichiers
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = path.join(__dirname, '../uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + '-' + file.originalname);
  }
});

const fileFilter = (req, file, cb) => {
  const allowedMimes = [
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/csv',
    'application/csv',
    'text/x-csv',
    'application/x-csv',
    'text/comma-separated-values',
    'text/x-comma-separated-values',
    'application/octet-stream'
  ];

  if (allowedMimes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Format de fichier non supporté. Veuillez utiliser un fichier Excel (.xlsx, .xls) ou CSV.'));
  }
};

const upload = multer({ 
  storage: storage,
  fileFilter: fileFilter
});

// Route pour importer des certificats à partir d'un fichier Excel
router.post('/import', [auth, canCreateCertificates, upload.single('file')], async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Aucun fichier n\'a été téléchargé' });
    }

    // Vérifier que le groupCode est fourni
    if (!req.body.groupCode) {
      return res.status(400).json({ error: 'Le code du groupe est requis' });
    }

    // Vérifier que le groupe existe
    const group = await Group.findOne({ groupCode: req.body.groupCode });
    if (!group) {
      return res.status(400).json({ error: 'Groupe non trouvé' });
    }

    const filePath = req.file.path;
    
    // Options pour la lecture du fichier Excel
    const workbook = xlsx.readFile(filePath, {
      cellDates: false,
      raw: true
    });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];

    // Convertir en JSON avec les options appropriées
    const rawData = xlsx.utils.sheet_to_json(worksheet, {
      raw: true,
      defval: null
    });

    if (rawData.length === 0) {
      return res.status(400).json({ error: 'Le fichier ne contient aucune donnée' });
    }


    // Si c'est un nombre, montrer la conversion
    if (typeof rawData[0]['Date de début'] === 'number') {
      console.log('\n🔄 CONVERSION DU NUMÉRO EXCEL:');
      console.log('Numéro Excel:', rawData[0]['Date de début']);
      const dateConvertie = excelDateToJSDate(rawData[0]['Date de début']);
      console.log('Date convertie:', dateConvertie ? dateConvertie.toISOString() : 'conversion échouée');
    }

    const results = [];
    let successCount = 0;

    for (const row of rawData) {
      try {
        // Normaliser toutes les dates
        const birthDate = normalizeDate(row['Date de naissance']);
        const startDate = normalizeDate(row['Date de début']);
        const endDate = normalizeDate(row['Date de fin']);

        // Mapper les données du fichier Excel aux champs du certificat
        const mappedRow = {
          fullName: row['Nom complet'],
          dateOfBirth: birthDate,
          placeOfBirth: row['Lieu de naissance'],
          referenceLevel: row['Niveau de référence'],
          courseStartDate: startDate,
          courseEndDate: endDate,
          lessonUnits: row['Nombre de leçons'],
          lessonsAttended: row['Leçons suivies'] || row['Nombre de leçons'],
          comments: row['Commentaires'],
          evaluation: row['Évaluation'],
          courseInfo: row['Info cours'] || 'Complete level'
        };

        // Vérifier que les dates sont valides
        if (!birthDate || !startDate || !endDate) {
          results.push({
            fullName: mappedRow.fullName || 'Inconnu',
            success: false,
            message: 'Une ou plusieurs dates sont invalides'
          });
          continue;
        }

        // Vérifier les champs requis
        if (!mappedRow.fullName || !mappedRow.placeOfBirth || !mappedRow.referenceLevel) {
          throw new Error('Champs requis manquants');
        }

        // Vérifier que lessonsAttended ne dépasse pas lessonUnits
        const lessonUnits = parseInt(mappedRow.lessonUnits) || 0;
        const lessonsAttended = parseInt(mappedRow.lessonsAttended) || lessonUnits || 0;
        
        if (lessonsAttended > lessonUnits) {
          results.push({
            fullName: mappedRow.fullName,
            success: false,
            message: `Le nombre de leçons suivies (${lessonsAttended}) ne peut pas être supérieur au nombre total de leçons (${lessonUnits})`
          });
          continue;
        }

        // Normaliser l'évaluation
        let normalizedEvaluation = mappedRow.evaluation;
        if (typeof mappedRow.evaluation === 'string') {
          const lowerEval = mappedRow.evaluation.toLowerCase();
          if (lowerEval.includes('bon') || lowerEval.includes('good')) {
            normalizedEvaluation = 'Good';
          } else if (lowerEval.includes('excellent') || lowerEval.includes('outstanding')) {
            normalizedEvaluation = 'Outstanding';
          } else if (lowerEval.includes('satisfaisant') || lowerEval.includes('satisfactory')) {
            normalizedEvaluation = 'Satisfactory';
          } else if (lowerEval.includes('participant')) {
            normalizedEvaluation = 'Participant';
          } else {
            throw new Error(`Valeur d'évaluation invalide: ${mappedRow.evaluation}. Les valeurs acceptées sont: Outstanding, Good, Satisfactory, Participant`);
          }
        }

        // Normaliser courseInfo
        let normalizedCourseInfo = mappedRow.courseInfo;
        if (typeof mappedRow.courseInfo === 'string') {
          const lowerInfo = mappedRow.courseInfo.toLowerCase();
          if (lowerInfo.includes('complete')) {
            normalizedCourseInfo = 'Complete level';
          } else if (lowerInfo.includes('partial')) {
            normalizedCourseInfo = 'Partially completed level';
          } else if (lowerInfo.includes('drop')) {
            normalizedCourseInfo = 'Course dropped out';
          } else if (lowerInfo.includes('no participation')) {
            normalizedCourseInfo = 'No participation';
          } else {
            throw new Error(`Valeur d'info cours invalide: ${mappedRow.courseInfo}. Les valeurs acceptées sont: Complete level, Partially completed level, Course dropped out, No participation`);
          }
        }

        // Vérifier que le niveau du certificat correspond au niveau du groupe
        if (group.level !== mappedRow.referenceLevel) {
          results.push({
            fullName: mappedRow.fullName,
            success: false,
            message: `Le niveau du certificat (${mappedRow.referenceLevel}) ne correspond pas au niveau du groupe (${group.level})`
          });
          continue;
        }

        // Vérifier que la date de début correspond à la date de début du groupe
        const certificateStartDate = new Date(mappedRow.courseStartDate);
        const groupStartDate = new Date(group.startDate);
        // Comparer uniquement les dates (sans l'heure)
        certificateStartDate.setHours(0, 0, 0, 0);
        groupStartDate.setHours(0, 0, 0, 0);
        if (certificateStartDate.getTime() !== groupStartDate.getTime()) {
          results.push({
            fullName: mappedRow.fullName,
            success: false,
            message: `La date de début du certificat doit correspondre à la date de début du groupe (${groupStartDate.toLocaleDateString()})`
          });
          continue;
        }

        // Vérifier si un certificat similaire existe déjà
        const existingCertificate = await Certificate.findOne({
          fullName: mappedRow.fullName,
          dateOfBirth: mappedRow.dateOfBirth,
          referenceLevel: mappedRow.referenceLevel,
          courseStartDate: mappedRow.courseStartDate,
          courseEndDate: mappedRow.courseEndDate
        });

        if (existingCertificate) {
          results.push({
            fullName: mappedRow.fullName,
            success: false,
            message: `Un certificat existe déjà pour cet étudiant avec le même niveau (${mappedRow.referenceLevel}) et les mêmes dates de cours`
          });
          continue;
        }

        // Créer un nouveau certificat
        const referenceNumber = await Certificate.generateReferenceNumber(mappedRow.referenceLevel);
        const certificate = new Certificate({
          referenceNumber,
          fullName: mappedRow.fullName,
          dateOfBirth: mappedRow.dateOfBirth,
          placeOfBirth: mappedRow.placeOfBirth,
          referenceLevel: mappedRow.referenceLevel,
          courseStartDate: mappedRow.courseStartDate,
          courseEndDate: mappedRow.courseEndDate,
          lessonUnits: parseInt(mappedRow.lessonUnits) || 0,
          lessonsAttended: parseInt(mappedRow.lessonsAttended) || parseInt(mappedRow.lessonUnits) || 0,
          comments: mappedRow.comments || '',
          evaluation: normalizedEvaluation,
          courseInfo: normalizedCourseInfo,
          createdBy: req.user._id,
          userId: req.user._id,
          groupCode: req.body.groupCode
        });

        await certificate.save();
        successCount++;

        results.push({
          fullName: mappedRow.fullName,
          success: true,
          message: 'Certificat créé avec succès'
        });
      } catch (err) {
        results.push({
          fullName: row['Nom complet'] || 'Inconnu',
          success: false,
          message: `Erreur: ${err.message}`
        });
      }
    }

    // Supprimer le fichier temporaire
    fs.unlinkSync(filePath);

    res.json({
      success: successCount,
      total: rawData.length,
      results: results
    });
  } catch (error) {
    // Si une erreur se produit, essayer de supprimer le fichier temporaire
    if (req.file && req.file.path && fs.existsSync(req.file.path)) {
      try {
        fs.unlinkSync(req.file.path);
      } catch (unlinkError) {
        console.error('Erreur lors de la suppression du fichier temporaire:', unlinkError);
      }
    }
    console.error('Erreur lors de l\'importation:', error);
    res.status(500).json({ error: 'Erreur lors de l\'importation des certificats' });
  }
});

// Get all certificates
router.get('/', auth, async (req, res) => {
  try {
    const query = {};
    if (req.query.referenceNumber) {
      query.referenceNumber = new RegExp(req.query.referenceNumber, 'i');
    }

    const certificates = await Certificate.find(query)
      .populate('userId', 'username')
      .populate('createdBy', 'username')
      .populate('generationHistory.generatedBy', 'username');

    res.json(certificates);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get certificate history (admin only)
router.get('/history/:id', [auth, canViewHistory], async (req, res) => {
  try {
    const certificate = await Certificate.findById(req.params.id)
      .populate('generationHistory.generatedBy', 'username');
    
    if (!certificate) {
      return res.status(404).json({ error: 'Certificat non trouvé' });
    }

    res.json(certificate.generationHistory);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get a specific certificate
router.get('/:id', auth, async (req, res) => {
  try {
    const certificate = await Certificate.findById(req.params.id)
      .populate('userId', 'username')
      .populate('createdBy', 'username')
      .populate('generationHistory.generatedBy', 'username');
    if (!certificate) {
      return res.status(404).json({ error: 'Certificate not found' });
    }

    // Check if user has permission to view this certificate
    if (req.user.role !== 'admin' && certificate.userId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: 'Access denied' });
    }

    res.json(certificate);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Generate PDF (all authenticated users)
router.get('/:id/pdf', auth, async (req, res) => {
  try {
    const certificate = await Certificate.findById(req.params.id)
      .populate('userId', 'username')
      .populate('createdBy', 'username');

    if (!certificate) {
      return res.status(404).json({ error: 'Certificat non trouvé' });
    }

    // Générer le PDF
    const pdfPath = await generateCertificatePDF(certificate);

    // Ajouter l'entrée dans l'historique
    certificate.generationHistory.push({
      generatedBy: req.user._id,
      generatedAt: new Date()
    });
    await certificate.save();

    // Envoyer le fichier
    res.download(pdfPath, `certificat_${certificate._id}.pdf`, (err) => {
      if (err) {
        console.error('Erreur lors de l\'envoi du fichier:', err);
      }
      // Supprimer le fichier temporaire
      fs.unlink(pdfPath, (unlinkErr) => {
        if (unlinkErr) {
          console.error('Erreur lors de la suppression du fichier temporaire:', unlinkErr);
        }
      });
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create certificate (admin only)
router.post('/', [auth, canCreateCertificates], async (req, res) => {
  try {
    const { groupCode, referenceLevel, fullName, dateOfBirth, courseStartDate, courseEndDate, ...otherData } = req.body;

    // Vérifier que le groupCode est fourni
    if (!groupCode) {
      return res.status(400).json({ error: 'Le groupe est requis' });
    }

    // Vérifier que le groupe existe
    const group = await Group.findOne({ groupCode });
    if (!group) {
      return res.status(400).json({ error: 'Groupe non trouvé' });
    }

    // Vérifier que le niveau du certificat correspond au niveau du groupe
    if (group.level !== referenceLevel) {
      return res.status(400).json({ 
        error: `Le niveau du certificat (${referenceLevel}) doit correspondre au niveau du groupe (${group.level})`
      });
    }

    // Vérifier que la date de début correspond à la date de début du groupe
    const certificateStartDate = new Date(courseStartDate);
    const groupStartDate = new Date(group.startDate);
    // Comparer uniquement les dates (sans l'heure)
    certificateStartDate.setHours(0, 0, 0, 0);
    groupStartDate.setHours(0, 0, 0, 0);
    if (certificateStartDate.getTime() !== groupStartDate.getTime()) {
      return res.status(400).json({ 
        error: `La date de début du certificat doit correspondre à la date de début du groupe (${groupStartDate.toLocaleDateString()})`
      });
    }

    // Vérifier que lessonsAttended ne dépasse pas lessonUnits
    const lessonUnits = parseInt(otherData.lessonUnits) || 0;
    const lessonsAttended = parseInt(otherData.lessonsAttended) || lessonUnits || 0;
    
    if (lessonsAttended > lessonUnits) {
      return res.status(400).json({
        error: `Le nombre de leçons suivies (${lessonsAttended}) ne peut pas être supérieur au nombre total de leçons (${lessonUnits})`
      });
    }

    // Vérifier si un certificat similaire existe déjà
    const existingCertificate = await Certificate.findOne({
      fullName: fullName,
      dateOfBirth: dateOfBirth,
      referenceLevel: referenceLevel,
      courseStartDate: certificateStartDate,
      courseEndDate: new Date(courseEndDate)
    });

    if (existingCertificate) {
      return res.status(400).json({ 
        error: `Un certificat existe déjà pour cet étudiant avec le même niveau (${referenceLevel}) et les mêmes dates de cours`
      });
    }

    // Créer un nouveau certificat
    const referenceNumber = await Certificate.generateReferenceNumber(referenceLevel);
    const certificate = new Certificate({
      referenceNumber,
      fullName: fullName,
      dateOfBirth: dateOfBirth,
      placeOfBirth: otherData.placeOfBirth,
      referenceLevel: referenceLevel,
      courseStartDate: certificateStartDate,
      courseEndDate: new Date(courseEndDate),
      lessonUnits: lessonUnits,
      lessonsAttended: lessonsAttended,
      comments: otherData.comments || '',
      evaluation: otherData.evaluation,
      courseInfo: otherData.courseInfo || 'Complete level',
      createdBy: req.user._id,
      userId: req.user._id,
      groupCode: groupCode
    });

    await certificate.save();

    res.json({
      success: true,
      message: 'Certificat créé avec succès'
    });
  } catch (error) {
    console.error('Erreur lors de la création du certificat:', error);
    res.status(500).json({ error: 'Erreur lors de la création du certificat' });
  }
});

// Update certificate (admin and manager only)
router.put('/:id', [auth, canModifyCertificates], async (req, res) => {
  try {
    const { groupCode, referenceLevel, fullName, dateOfBirth, courseStartDate, courseEndDate, ...otherData } = req.body;

    // Vérifier que le groupCode est fourni
    if (!groupCode) {
      return res.status(400).json({ error: 'Le groupe est requis' });
    }

    // Vérifier que le groupe existe
    const group = await Group.findOne({ groupCode });
    if (!group) {
      return res.status(400).json({ error: 'Groupe non trouvé' });
    }

    // Vérifier que le niveau du certificat correspond au niveau du groupe
    if (group.level !== referenceLevel) {
      return res.status(400).json({ 
        error: `Le niveau du certificat (${referenceLevel}) doit correspondre au niveau du groupe (${group.level})`
      });
    }

    // Vérifier que la date de début correspond à la date de début du groupe
    const certificateStartDate = new Date(courseStartDate);
    const groupStartDate = new Date(group.startDate);
    // Comparer uniquement les dates (sans l'heure)
    certificateStartDate.setHours(0, 0, 0, 0);
    groupStartDate.setHours(0, 0, 0, 0);
    if (certificateStartDate.getTime() !== groupStartDate.getTime()) {
      return res.status(400).json({ 
        error: `La date de début du certificat doit correspondre à la date de début du groupe (${groupStartDate.toLocaleDateString()})`
      });
    }

    // Vérifier que lessonsAttended ne dépasse pas lessonUnits
    const lessonUnits = parseInt(otherData.lessonUnits) || 0;
    const lessonsAttended = parseInt(otherData.lessonsAttended) || lessonUnits || 0;
    
    if (lessonsAttended > lessonUnits) {
      return res.status(400).json({
        error: `Le nombre de leçons suivies (${lessonsAttended}) ne peut pas être supérieur au nombre total de leçons (${lessonUnits})`
      });
    }

    // Vérifier si un certificat similaire existe déjà (excluant le certificat actuel)
    const birthDate = new Date(dateOfBirth);
    const endDate = new Date(courseEndDate);
    
    // Normaliser toutes les dates (sans l'heure)
    birthDate.setHours(0, 0, 0, 0);
    certificateStartDate.setHours(0, 0, 0, 0);
    endDate.setHours(0, 0, 0, 0);

    console.log('Recherche de doublons avec les paramètres suivants:', {
      certificatId: req.params.id,
      fullName,
      birthDate: birthDate.toISOString(),
      referenceLevel,
      courseStartDate: certificateStartDate.toISOString(),
      courseEndDate: endDate.toISOString()
    });

    const existingCertificate = await Certificate.findOne({
      _id: { $ne: req.params.id },
      fullName: fullName,
      dateOfBirth: {
        $gte: new Date(birthDate.setHours(0, 0, 0, 0)),
        $lte: new Date(birthDate.setHours(23, 59, 59, 999))
      },
      referenceLevel: referenceLevel,
      courseStartDate: {
        $gte: new Date(certificateStartDate.setHours(0, 0, 0, 0)),
        $lte: new Date(certificateStartDate.setHours(23, 59, 59, 999))
      },
      courseEndDate: {
        $gte: new Date(endDate.setHours(0, 0, 0, 0)),
        $lte: new Date(endDate.setHours(23, 59, 59, 999))
      }
    });

    if (existingCertificate) {
      console.log('Certificat existant trouvé:', {
        id: existingCertificate._id,
        fullName: existingCertificate.fullName,
        dateOfBirth: existingCertificate.dateOfBirth,
        referenceLevel: existingCertificate.referenceLevel,
        courseStartDate: existingCertificate.courseStartDate,
        courseEndDate: existingCertificate.courseEndDate
      });

      return res.status(400).json({ 
        error: `Un certificat existe déjà pour cet étudiant avec le même niveau (${referenceLevel}) et les mêmes dates de cours`
      });
    }

    // Mettre à jour le certificat
    const updatedCertificate = await Certificate.findByIdAndUpdate(
      req.params.id,
      {
        fullName: fullName,
        dateOfBirth: dateOfBirth,
        placeOfBirth: otherData.placeOfBirth,
        referenceLevel: referenceLevel,
        courseStartDate: certificateStartDate,
        courseEndDate: new Date(courseEndDate),
        lessonUnits: lessonUnits,
        lessonsAttended: lessonsAttended,
        comments: otherData.comments || '',
        evaluation: otherData.evaluation,
        courseInfo: otherData.courseInfo || 'Complete level',
        groupCode: groupCode
      },
      { new: true, runValidators: true }
    ).populate('userId', 'username').populate('createdBy', 'username');

    if (!updatedCertificate) {
      return res.status(404).json({ error: 'Certificat non trouvé' });
    }

    res.json(updatedCertificate);
  } catch (error) {
    console.error('Erreur lors de la modification du certificat:', error);
    res.status(500).json({ error: 'Erreur lors de la modification du certificat' });
  }
});

// Delete certificate (admin only)
router.delete('/:id', [auth, isAdmin], async (req, res) => {
  try {
    const certificate = await Certificate.findByIdAndDelete(req.params.id);
    if (!certificate) {
      return res.status(404).json({ error: 'Certificat non trouvé' });
    }
    res.json({ message: 'Certificat supprimé avec succès' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Vérifier les doublons
router.post('/check-duplicate', auth, async (req, res) => {
  try {
    const { fullName, dateOfBirth, referenceLevel, courseStartDate, courseEndDate } = req.body;

    // Convertir et normaliser les dates (sans l'heure)
    const startDate = new Date(courseStartDate);
    const endDate = new Date(courseEndDate);
    const birthDate = new Date(dateOfBirth);

    startDate.setHours(0, 0, 0, 0);
    endDate.setHours(0, 0, 0, 0);
    birthDate.setHours(0, 0, 0, 0);

    // Rechercher un certificat existant avec les mêmes informations clés
    const existingCertificate = await Certificate.findOne({
      fullName: fullName,
      dateOfBirth: birthDate,
      referenceLevel: referenceLevel,
      courseStartDate: startDate,
      courseEndDate: endDate
    });

    res.json({
      exists: !!existingCertificate,
      certificate: existingCertificate ? {
        id: existingCertificate._id,
        referenceNumber: existingCertificate.referenceNumber
      } : null
    });
  } catch (error) {
    console.error('Error checking duplicate certificate:', error);
    res.status(500).json({ error: 'Erreur lors de la vérification des doublons' });
  }
});

module.exports = router;