const mongoose = require('mongoose');

const groupSchema = new mongoose.Schema({
  level: {
    type: String,
    enum: ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'],
    required: true
  },
  startDate: {
    type: Date,
    required: true
  },
  timeSlot: {
    type: String,
    enum: ['MO', 'MI', 'NM', 'AB'],
    required: true
  },
  name: {
    type: String,
    required: true
  },
  groupCode: {
    type: String,
    unique: true,
    required: true
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Middleware pour générer automatiquement le groupCode avant la validation
groupSchema.pre('validate', function(next) {
  if (this.isNew || this.isModified('level') || this.isModified('startDate') || 
      this.isModified('timeSlot') || this.isModified('name')) {
    const date = new Date(this.startDate);
    const formattedDate = `${String(date.getDate()).padStart(2, '0')}.${String(date.getMonth() + 1).padStart(2, '0')}.${date.getFullYear()}`;
    this.groupCode = `${this.level}-${formattedDate}-${this.timeSlot}-${this.name}`;
  }
  next();
});

module.exports = mongoose.model('Group', groupSchema); 