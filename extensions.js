// EXTENSIONS DU CERVEAU — le cerveau ecrit ici, et il peut effacer.
// Chaque bloc est un geste NOUVEAU ajouté par l équipe : relu, verifie (syntaxe, longueur,
// mots interdits, verrous), TESTE sur son exemple avant d etre declare vivant.
// Isaac : tu peux lire et editer ce fichier toi-meme. Un bloc retire = le geste disparait.
// Un geste n a acces ni au disque, ni au reseau, ni aux verrous legaux de la maison.

// >>>EXT analyse_statistique | grave le 2026-10-01 22:37 par AELYRA | geste demande : apprends moi a compter les mots et les caracteres d un texte
Ext.registrer({
  nom: 'analyse_statistique',
  titre: 'Calculer la densite d un texte dicte',
  quand: 'evalue ce texte',
  aide: 'aelyra, evalue ce texte : ...',
  exemple: 'Isaac travaille sur son projet',
  trait: function (texte, ctx) {
    if (!texte || texte.length === 0) {
      return 'Je n entends aucun contenu a analyser, Isaac.';
    }
    var liste = String(texte).trim().split(/\s+/);
    var nbMots = liste.length;
    var nbCar = String(texte).length;
    return 'Ton texte contient ' + nbMots + ' mots et ' + nbCar + ' caracteres au total.';
  }
});
// <<<EXT analyse_statistique

// >>>EXT compte_voyelles | grave le 2026-10-01 23:30 par AELYRA | geste demande : apprends-moi a compter les voyelles d un texte
Ext.registrer({
  nom: 'compte_voyelles',
  titre: 'Calculer le nombre de voyelles dans une phrase',
  quand: 'dénombre les sons',
  aide: 'aelyra, dénombre les sons de ce texte : ...',
  exemple: 'Isaac travaille sur son projet',
  trait: function (texte, ctx) {
    var v = String(texte).toLowerCase().match(/[aeiouyàâéèêëîïôûù]/gi);
    var n = v ? v.length : 0;
    return 'Ton texte contient ' + n + ' voyelles au total, mon cher Isaac.';
  }
});
// <<<EXT compte_voyelles
