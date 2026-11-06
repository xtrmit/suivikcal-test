/* SuiviKcal — données de référence, utilisables hors ligne.
   FOODS : extrait simplifié de la table Ciqual (ANSES, données ouvertes), valeurs pour 100 g.
   À remplacer par la table Ciqual complète (≈ 3 000 aliments) dans une prochaine version. */
const FOODS = [
 ['pain',['baguette','tartine','pain'],'Pain baguette',270,9,55,1.5,50,'1/5 de baguette',''],
 ['beurre',['beurre'],'Beurre',740,.7,.6,82,10,'1 noisette (10 g)',''],
 ['confiture',['confiture'],'Confiture',250,.4,60,.1,20,'1 c. à soupe','sweet'],
 ['cafe',['cafe','expresso','the'],'Café',2,.1,.3,0,150,'1 tasse',''],
 ['lait',['lait'],'Lait demi-écrémé',46,3.3,4.8,1.6,200,'1 verre','prot'],
 ['yaourt',['yaourt','yogourt'],'Yaourt nature',60,4,5,3,125,'1 pot','prot'],
 ['fromageblanc',['fromage blanc'],'Fromage blanc',75,7.5,4,3,100,'100 g','prot'],
 ['muesli',['muesli','cereales'],'Muesli',370,10,62,6,50,'1 bol (50 g)',''],
 ['banane',['banane'],'Banane',90,1.1,20,.3,120,'1 banane','fruit'],
 ['pomme',['pomme'],'Pomme',52,.3,12,.2,150,'1 pomme','fruit'],
 ['orange',['orange'],'Orange',45,.9,9,.1,150,'1 orange','fruit'],
 ['oeuf',['oeuf','omelette'],'Œuf',140,12.5,.5,10,50,'1 œuf','prot'],
 ['jambon',['jambon'],'Jambon blanc',115,20,1,3.5,40,'1 tranche','prot'],
 ['poulet',['poulet','dinde'],'Poulet rôti',165,31,0,3.6,120,'1 blanc (120 g)','prot'],
 ['steak',['steak','boeuf','hache'],'Steak haché 5 %',125,21,0,5,100,'1 steak','prot'],
 ['saumon',['saumon','poisson'],'Saumon',200,20,0,13,120,'1 pavé','prot'],
 ['riz',['riz'],'Riz cuit',130,2.7,28,.3,150,'1 assiette (150 g)',''],
 ['pates',['pates','spaghetti','tagliatelle'],'Pâtes cuites',150,5,30,.9,200,'1 assiette (200 g)',''],
 ['pdt',['pomme de terre','pommes de terre','puree'],'Pommes de terre',85,2,18,.1,200,'200 g','veg'],
 ['frites',['frite'],'Frites',300,3.5,38,15,130,'1 portion',''],
 ['salade',['salade'],'Salade verte',15,1.3,1.5,.2,80,'1 bol','veg'],
 ['tomate',['tomate'],'Tomate',18,.9,3.5,.2,100,'1 tomate','veg'],
 ['haricots',['haricot'],'Haricots verts',30,1.8,4,.2,150,'1 portion','veg'],
 ['carottes',['carotte'],'Carottes',35,.8,7,.2,100,'100 g','veg'],
 ['lentilles',['lentille'],'Lentilles cuites',115,9,17,.5,150,'1 portion','prot'],
 ['camembert',['camembert'],'Camembert',280,20,.5,22,30,'1 part',''],
 ['emmental',['emmental','gruyere','fromage rape'],'Emmental râpé',380,28,0,30,20,'1 poignée',''],
 ['huile',['huile'],"Huile d'olive",900,0,0,100,10,'1 c. à soupe',''],
 ['pizza',['pizza'],'Pizza',260,11,30,10,300,'1/2 pizza',''],
 ['lasagnes',['lasagne'],'Lasagnes',150,8,13,7,300,'1 part',''],
 ['quiche',['quiche'],'Quiche lorraine',260,9,18,17,150,'1 part',''],
 ['croissant',['croissant'],'Croissant',410,8,45,21,60,'1 croissant','sweet'],
 ['painchoc',['pain au chocolat','chocolatine'],'Pain au chocolat',420,7,46,23,65,'1 pièce','sweet'],
 ['chocolat',['chocolat'],'Chocolat noir',550,7,35,40,20,'2 carrés','sweet'],
 ['biscuit',['biscuit','gateau','cookie'],'Biscuit',470,6,68,19,25,'2 biscuits','sweet'],
 ['compote',['compote'],'Compote',75,.3,17,.1,100,'1 gourde','fruit'],
 ['vin',['vin'],'Vin rouge',85,0,2.6,0,125,'1 verre',''],
 ['biere',['biere'],'Bière',42,.4,3.5,0,250,'1 demi',''],
 ['soda',['soda','coca'],'Soda',42,0,10.6,0,330,'1 canette','sweet'],
 ['jus',['jus'],"Jus d'orange",45,.7,10,.2,200,'1 verre','fruit'],
 ['amandes',['amande','noix'],'Amandes',600,21,8,52,25,'1 poignée',''],
 ['soupe',['soupe','veloute'],'Soupe de légumes',40,1.2,6,1.2,300,'1 bol','veg'],
 ['sandwich',['sandwich','jambon beurre'],'Sandwich jambon-beurre',260,12,30,10,200,'1 sandwich',''],
 ['glace',['glace'],'Glace',200,3.5,24,10,100,'2 boules','sweet']
].map(f=>({id:f[0],keys:f[1],n:f[2],kc:f[3],p:f[4],g:f[5],l:f[6],pg:f[7],pl:f[8],cat:f[9]}));
const FOOD = Object.fromEntries(FOODS.map(f=>[f.id,f]));
const KEYS = FOODS.flatMap(f=>f.keys.map(k=>({k,f}))).sort((a,b)=>b.k.length-a.k.length);

const MEALS=[{id:'pdj',n:'Petit-déj',e:'☕'},{id:'dej',n:'Déjeuner',e:'🥗'},{id:'col',n:'Collation',e:'🍎'},{id:'din',n:'Dîner',e:'🍲'}];
const MEAL=Object.fromEntries(MEALS.map(m=>[m.id,m]));
const ACTIVITY=[{n:'Sédentaire',d:'Bureau, peu de marche',f:1.2},{n:'Légère',d:'Marche ou sport 1 à 3 fois par semaine',f:1.375},{n:'Modérée',d:'Sport 3 à 5 fois par semaine',f:1.55},{n:'Active',d:'Sport 6 à 7 fois par semaine',f:1.725},{n:'Très active',d:'Métier physique ou entraînement intense',f:1.9}];
const PACE=[{n:'Doux',pct:.10},{n:'Normal',pct:.17},{n:'Soutenu',pct:.25}];
const SPORTS=[['🚶','Marche',3.5],['🚶‍♀️','Marche rapide',4.3],['🏃','Course',9.8],['🚴','Vélo',7.5],['🏊','Natation',7],['🏋️','Musculation',5],['🧘','Yoga',2.5],['💃','Danse',5],['🧹','Ménage',3.3],['🌿','Jardinage',4]];
const PHRASES={
 '😊':['Bravo, tu peux être fier·e de toi 🌟','Bien joué, un repas qui fait du bien 💪','Super choix, continue comme ça ✨'],
 '😐':['Un repas comme un autre, et c\'est très bien 🙂','Pas de jugement ici, on avance 🌱','Chaque repas noté, c\'est déjà gagné 👍'],
 '😕':['Ça arrive à tout le monde, le prochain sera meilleur 🤗','Un écart n\'efface pas tes efforts 💛','On ne compte pas les écarts, on compte les progrès 🌱']
};

