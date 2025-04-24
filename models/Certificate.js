const mongoose = require('mongoose');

const certificateCounterSchema = new mongoose.Schema({
  year: { type: Number, required: true },
  level: { type: String, required: true },
  count: { type: Number, default: 0 }
});

certificateCounterSchema.index({ year: 1, level: 1 }, { unique: true });

const CertificateCounter = mongoose.model('CertificateCounter', certificateCounterSchema);

const certificateSchema = new mongoose.Schema({
  referenceNumber: {
    type: String,
    unique: true,
    required: true
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  groupCode: {
    type: String,
    ref: 'Group',
    required: true
  },
  fullName: {
    type: String,
    required: true
  },
  dateOfBirth: {
    type: Date,
    required: true
  },
  placeOfBirth: {
    type: String,
    required: true
  },
  courseStartDate: {
    type: Date,
    required: true
  },
  courseEndDate: {
    type: Date,
    required: true
  },
  lessonUnits: {
    type: Number,
    required: true
  },
  referenceLevel: {
    type: String,
    enum: ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'],
    required: true
  },
  courseInfo: {
    type: String,
    required: true
  },
  comments: {
    type: String
  },
  lessonsAttended: {
    type: Number,
    required: true
  },
  evaluation: {
    type: String,
    enum: ['Outstanding', 'Good', 'Satisfactory', 'Participant'],
    required: true
  },
  generationHistory: [{
    generatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    generatedAt: {
      type: Date,
      default: Date.now
    }
  }],
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Ajouter un index composé pour la recherche de doublons
certificateSchema.index({
  fullName: 1,
  dateOfBirth: 1,
  referenceLevel: 1,
  courseStartDate: 1,
  courseEndDate: 1
});

// Fonction pour générer le numéro de référence
certificateSchema.statics.generateReferenceNumber = async function(level) {
  const year = new Date().getFullYear();
  
  // Trouver ou créer le compteur pour cette année et ce niveau
  let counter = await CertificateCounter.findOneAndUpdate(
    { year, level },
    { $inc: { count: 1 } },
    { upsert: true, new: true }
  );

  // Formater le numéro avec des zéros devant
  const sequentialNumber = counter.count.toString().padStart(4, '0');
  
  // Retourner le numéro de référence formaté
  return `GLZ-${year}-${level}-${sequentialNumber}`;
};

module.exports = mongoose.model('Certificate', certificateSchema); 