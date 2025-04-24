require('dotenv').config();
const mongoose = require('mongoose');
const Certificate = require('./models/Certificate');
const User = require('./models/User');

const seedCertificates = async () => {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    // Find admin and manager IDs
    const admin = await User.findOne({ username: 'admin' });
    const manager = await User.findOne({ username: 'manager' });

    if (!admin || !manager) {
      console.error('Admin or manager user not found');
      return;
    }

    // Clear existing certificates
    await Certificate.deleteMany({});
    console.log('Cleared existing certificates');

    const certificates = [
      {
        userId: admin._id,
        fullName: 'John Smith',
        dateOfBirth: '1990-01-15',
        placeOfBirth: 'Brussels',
        courseStartDate: '2024-01-01',
        courseEndDate: '2024-03-31',
        lessonUnits: 30,
        referenceLevel: 'B2',
        courseInfo: 'Complete Level B2',
        comments: 'Excellent progress throughout the course',
        lessonsAttended: 28,
        evaluation: 'Outstanding',
        createdBy: manager._id
      },
      {
        userId: manager._id,
        fullName: 'Marie Dubois',
        dateOfBirth: '1995-05-20',
        placeOfBirth: 'Liège',
        courseStartDate: '2024-02-01',
        courseEndDate: '2024-04-30',
        lessonUnits: 25,
        referenceLevel: 'A2',
        courseInfo: 'Complete Level A2',
        comments: 'Good participation in class activities',
        lessonsAttended: 22,
        evaluation: 'Good',
        createdBy: manager._id
      },
      {
        userId: admin._id,
        fullName: 'Peter Johnson',
        dateOfBirth: '1988-11-30',
        placeOfBirth: 'Antwerp',
        courseStartDate: '2024-03-01',
        courseEndDate: '2024-05-31',
        lessonUnits: 40,
        referenceLevel: 'C1',
        courseInfo: 'Advanced Business German',
        comments: 'Demonstrated excellent business communication skills',
        lessonsAttended: 38,
        evaluation: 'Outstanding',
        createdBy: manager._id
      }
    ];

    // Create certificates
    for (const certificateData of certificates) {
      const certificate = new Certificate(certificateData);
      await certificate.save();
      console.log(`Created certificate for: ${certificate.fullName}`);
    }

    console.log('Database seeded successfully');
    process.exit(0);
  } catch (error) {
    console.error('Error seeding database:', error);
    process.exit(1);
  }
};

seedCertificates(); 