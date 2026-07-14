const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

// 2 niveaux : tools/ → projet racine → images/
const IMAGE_DIR = path.join(__dirname, '..', 'images');
const PROCESSED_DIR = path.join(__dirname, '..', 'images', 'processed');
const MAX_WIDTH = 4096;
const MAX_HEIGHT = 2048;
const QUALITY = 80;

// Créer le dossier processed s'il n'existe pas
if (!fs.existsSync(PROCESSED_DIR)) {
    fs.mkdirSync(PROCESSED_DIR, { recursive: true });
}

// Lire les fichiers images
const files = fs.readdirSync(IMAGE_DIR);
const imageFiles = files.filter(f => /\.(jpg|jpeg|png|webp)$/i.test(f));

console.log(`📸 ${imageFiles.length} images à traiter...`);

let processed = 0;
let errors = 0;

imageFiles.forEach((file) => {
    const inputPath = path.join(IMAGE_DIR, file);
    const ext = path.extname(file);
    const baseName = path.basename(file, ext);
    const outputPath = path.join(PROCESSED_DIR, baseName + '.webp');

    sharp(inputPath)
        .resize(MAX_WIDTH, MAX_HEIGHT, {
            fit: 'inside',
            withoutEnlargement: true
        })
        .webp({ quality: QUALITY })
        .toFile(outputPath)
        .then(() => {
            console.log(`✅ ${file} → ${baseName}.webp`);
            // Supprimer le fichier original
            fs.unlinkSync(inputPath);
            processed++;
        })
        .catch(err => {
            console.error(`❌ Erreur sur ${file}:`, err.message);
            errors++;
        });
});

// Afficher le résumé quand tout est terminé
const interval = setInterval(() => {
    const total = imageFiles.length;
    if (processed + errors === total) {
        clearInterval(interval);
        console.log(`\n✅ Terminé ! ${processed} images traitées, ${errors} erreurs.`);
        console.log(`📁 Les images optimisées sont dans ${PROCESSED_DIR}`);
    }
}, 500);