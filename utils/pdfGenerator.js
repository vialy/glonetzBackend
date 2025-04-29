const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

// Fonction pour formater la date au format DD/MM/YYYY
const formatDate = (dateString) => {
  console.log('Date originale reçue:', dateString);
  
  try {
    // Convertir la chaîne ISO en objet Date
    const date = new Date(dateString);
    
    // Vérifier si la date est valide
    if (isNaN(date.getTime())) {
      console.error('Date invalide:', dateString);
      return 'Date invalide';
    }

    // Utiliser toLocaleDateString pour forcer le format européen
    const formattedDate = date.toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });

    console.log('Date formatée:', formattedDate);
    return formattedDate;
    
  } catch (error) {
    console.error('Erreur lors du formatage de la date:', error);
    return 'Date invalide';
  }
};

// Objet de correspondance pour les évaluations
const evaluationTranslations = {
  'Outstanding': 'mit sehr gutem Erfolg / Outstanding',
  'Good': 'mit gutem Erfolg / Good',
  'Satisfactory': 'mit Erfolg / Satisfactory',
  'Participant': 'Teilgenommen / Participant'
};

// Objet de correspondance pour les informations de cours
const courseInfoTranslations = {
  'Complete level': 'Komplette Stufe / Complete level',
  'Partially completed level': 'Teilweise absolvierte Stufe / Partially completed level',
  'Course dropped out': 'Kurs abgebrochen / Course dropped out',
  'No participation': 'Keine Teilnahme / No participation'
};

const generateCertificatePDF = async (certificate) => {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'A4',
        margin: 50
      });

      const tempDir = path.join(__dirname, '../temp');
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir);
      }

      const filename = `certificate_${certificate._id}.pdf`;
      const filePath = path.join(tempDir, filename);
      const stream = fs.createWriteStream(filePath);

      stream.on('finish', () => resolve(filePath));
      stream.on('error', reject);

      doc.pipe(stream);

      // === WATERMARK Glonetz ===
      try {
        const watermarkPath = path.join(__dirname, '../assets/glonet.png');
        const pageWidth = doc.page.width;
        const pageHeight = doc.page.height;
        
        // Sauvegarder l'état actuel
        doc.save();
        
        // Appliquer une rotation au watermark
        const centerX = pageWidth / 2;
        const centerY = pageHeight / 2;
        doc.translate(centerX, centerY)
           .rotate(0, { origin: [0, 0] })
           .translate(-centerX, -centerY);
        
        // Dessiner le watermark
        doc.opacity(0.06); // Opacité encore plus faible
        const watermarkWidth = 400; // Taille augmentée
        const watermarkHeight = 400;
        doc.image(
          watermarkPath,
          (pageWidth - watermarkWidth) / 2,
          (pageHeight - watermarkHeight) / 2,
          { 
            width: watermarkWidth,
            height: watermarkHeight
          }
        );
        
        // Restaurer l'état original
        doc.restore();
      } catch (e) {
        console.error('Erreur watermark :', e);
      }

      // === LOGOS ===
      try {
        doc.image(path.join(__dirname, '../assets/bgs-logo-4.png'), 50, 30, { width: 80 });
        doc.image(path.join(__dirname, '../assets/glonet.png'), doc.page.width - 150, 10, { width: 70 });
      } catch (err) {
        console.error('Logo loading error:', err);
      }

      // === TITRE ===
      doc.moveDown(4);
      
      // Calculer la largeur du texte
      const titleText = 'TEILNAHMEBESTÄTIGUNG / ATTESTATION';
      const titleWidth = doc.widthOfString(titleText);
      const underlinePadding = 38; // Padding pour la ligne
      
      // Position du titre
      const pageCenter = (doc.page.width - titleWidth) / 2;
      const titleY = doc.y;
      
      // Écrire le texte
      doc.fillColor('#0066CC') // bleu
         .fontSize(14)
         .font('Helvetica-Bold')
         .text(titleText, {
           align: 'center'
         });

      // Ajouter le soulignement
      const underlineY = doc.y - 3; // Position plus proche du texte
      doc.save()
         .moveTo(pageCenter - underlinePadding/2, underlineY)
         .lineTo(pageCenter + titleWidth + underlinePadding/2, underlineY)
         .lineWidth(1.5) // Ligne plus épaisse
         .strokeColor('#0066CC') // Même couleur que le texte
         .stroke()
         .restore();
         
      doc.fillColor('black'); // reset couleur

      doc.moveDown(2);
      const lineSpacing = 20;

      // === INFOS PERSONNELLES ===
      doc.font('Helvetica')
         .fontSize(11)
         .text(' Referenznummer / Reference number : ', { continued: true })
         .font('Helvetica-Bold')
         .text(certificate.referenceNumber)
         .moveDown(1)
         .font('Helvetica')
         .text('Name, Vorname / Surname, First name: ', { continued: true })
         .font('Helvetica-Bold')
         .text(certificate.fullName)
         .font('Helvetica')
         .moveDown(0.5)
         .text('geboren am / Date of birth: ', { continued: true })
         .font('Helvetica-Bold')
         .text(formatDate(certificate.dateOfBirth), { continued: true })
         .font('Helvetica')
         .text('   geboren in / Place of birth: ', { continued: true })
         .font('Helvetica-Bold')
         .text(certificate.placeOfBirth);

      console.log('Dates du certificat:');
      console.log('Date de naissance:', certificate.dateOfBirth);
      console.log('Date de début:', certificate.courseStartDate);
      console.log('Date de fin:', certificate.courseEndDate);

      doc.moveDown(2);
      doc.font('Helvetica')
         .text('hat in der Zeit vom / attended from ', { continued: true })
         .font('Helvetica-Bold')
         .text(formatDate(certificate.courseStartDate), { continued: true })
         .font('Helvetica')
         .text(' bis / to ', { continued: true })
         .font('Helvetica-Bold')
         .text(formatDate(certificate.courseEndDate))
         .font('Helvetica')
         .text('an einem Deutschkurs im BGS Sari Douala Sprachzentrum teilgenommen / a course in the german language.')
         .moveDown(2)
         .text('Der Kurs umfasste / The course consisted in ', { continued: true })
         .font('Helvetica-Bold')
         .text(certificate.lessonUnits.toString(), { continued: true })
         .font('Helvetica')
         .text(' Unterrichtseinheiten à 45 Minuten / lessons of 45 minutes.');

      doc.moveDown(2);

      // === NIVEAU DE RÉFÉRENCE ===
      doc.text('Referenzniveau des Kurses / Reference Level of the course:', {
        align: 'left',
        indent: 0
      })
      .moveDown(0.8);

      const levels = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
      let xPos = 50;  // Position de départ ajustée
      const yPos = doc.y;
      const boxSize = 11;
      const spacing = 35;

      // Sauvegarder la position y initiale
      const initialY = doc.y;

      levels.forEach(level => {
        // Dessiner la case
        doc.rect(xPos, yPos, boxSize, boxSize).stroke();
        
        // Ajouter le X si c'est le niveau sélectionné
        if (level === certificate.referenceLevel) {
          doc.font('Helvetica-Bold')
             .fontSize(16)
             .text('X', xPos + 1.5, yPos + 1.5);
        }
        
        // Ajouter le texte du niveau
        doc.fontSize(11)
           .text(level, xPos + boxSize + 5, yPos + 2);
        
        xPos += spacing;
      });

      // Réinitialiser complètement la position pour la suite
      doc.y = initialY + 30; // Espace après les cases
      
      // === INFOS DU COURS ===
      doc.x = 50; // Réinitialiser la position x à la marge gauche
         doc.moveDown(2)
            .font('Helvetica')
            .fontSize(11)
            .text('Kursinfo / Course Information: ', {
              align: 'left',
              indent: 0,
              continued: true
         })
         .font('Helvetica-Bold')
         .text(courseInfoTranslations[certificate.courseInfo])
         .font('Helvetica');

      doc.moveDown(0.8);
      
      // Texte label
      doc.font('Helvetica')
         .text('Bemerkungen / Comments on the course: ', {
           align: 'left',
           indent: 0,
           continued: true
         })
         .font('Helvetica-Bold')
         .text(certificate.comments || '-')
         .font('Helvetica');

      // Même chose pour le nombre de leçons
      doc.moveDown(0.8);
      doc.text('Besuchte Unterrichtseinheiten / Number of lessons attended: ', {
        align: 'left',
        indent: 0,
        continued: true
      })
      .font('Helvetica-Bold')
      .text(certificate.lessonsAttended.toString())
      .font('Helvetica');

      // Et pour l'évaluation
      doc.moveDown(1.2);
      
      // Ajout de l'évaluation avec la traduction correspondante
      doc.font('Helvetica')
         .text('Bewertung / Evaluation: ', {
           align: 'left',
           indent: 0,
           continued: true
         })
         .font('Helvetica-Bold')
         .text(evaluationTranslations[certificate.evaluation])
         .font('Helvetica');

      doc.moveDown(1.5);

      // === PIED DE PAGE NOTE ===
      doc.fontSize(10)
         .text(
           'Diese Teilnahmebestätigung ist kein Zeugnis. Die Beurteilung der Kursleistungen erfolgte durch die Lehrerperson(en).',
           { width: 500 }
         )
         .text(
           'Die Bewertungsskala umfasst folgende Einteilung: mit sehr gutem Erfolg, mit gutem Erfolg, mit Erfolg, Teilgenommen.'
         )
         .moveDown(1)
         .text(
           'This is a certificate of attendance only, not a formal qualification. Grades were awarded by the course tutor(s).'
         )
         .text('The range of grades is: Outstanding, Good, Satisfactory, Participant.')
         .moveDown(4);

      // === SIGNATURES ===
      const signatureY = doc.y;
      const currentDate = formatDate(new Date()); // Utiliser formatDate ici aussi
      const pageWidth = doc.page.width;
      const signaturePageCenter = pageWidth / 2;
      const signatureWidth = doc.widthOfString('________________________');
      const dateText = `Douala, ${currentDate}`;
      const dateWidth = doc.widthOfString(dateText);
      // Position pour la colonne de gauche (date)
      const leftColumnX = signaturePageCenter - signatureWidth - 50;
      // Position pour la colonne de droite (signature)
      const rightColumnX = signaturePageCenter + 50;
      doc.font('Helvetica-Bold')
         .text(dateText, leftColumnX + 20, signatureY)
         .font('Helvetica')
         .text('________________________', leftColumnX, signatureY + 4)
         .text('Ort und Datum / Place and date', leftColumnX, signatureY + 20)
         .text('________________________', rightColumnX, signatureY)
         .text('Leitung / Management', rightColumnX + 20, signatureY + 20);

      doc.moveDown(2.5);

      // === COORDONNÉES DE CONTACT ===
      // Ajouter la ligne de séparation
      const lineY = doc.y;
      doc.save()
         .moveTo(50, lineY)
         .lineTo(doc.page.width - 50, lineY)
         .lineWidth(4)
         .strokeColor('#0066CC')
         .stroke()
         .restore();

      doc.moveDown(2.5);
      
      doc.fontSize(10)
         .fillColor('#333');

      // Première ligne - Informations légales
      doc.text(
        'Siège: Douala-Cameroun | N° Contr.: M032118559287D | RCCM NO: RC/DLA/2021/B/1719',
        50, doc.y, {
          width: doc.page.width - 100,
          align: 'center'
        }
      );

      doc.moveDown(0.5);

      // Deuxième ligne - Contacts
      doc.text(
        'E-Mail: kontakt@glonetz.com | Tel: +4915788372536 | Site web: www.glonetz.com',
        50, doc.y, {
          width: doc.page.width - 100,
          align: 'center'
        }
      );

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
};

module.exports = { generateCertificatePDF }; 