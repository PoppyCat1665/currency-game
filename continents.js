// Country -> continent mapping by ISO 3166-1 numeric id (matches world.js).
// Used to group the Countries toggle by continent in settings.
const COUNTRY_CONTINENT = {
  // ---- Africa ----
  12: "Africa", 24: "Africa", 204: "Africa", 72: "Africa", 854: "Africa",
  108: "Africa", 132: "Africa", 120: "Africa", 140: "Africa", 148: "Africa",
  174: "Africa", 178: "Africa", 384: "Africa", 180: "Africa", 262: "Africa",
  818: "Africa", 226: "Africa", 232: "Africa", 748: "Africa", 231: "Africa",
  266: "Africa", 270: "Africa", 288: "Africa", 324: "Africa", 624: "Africa",
  404: "Africa", 426: "Africa", 430: "Africa", 434: "Africa", 450: "Africa",
  454: "Africa", 466: "Africa", 478: "Africa", 480: "Africa", 504: "Africa",
  508: "Africa", 516: "Africa", 562: "Africa", 566: "Africa", 646: "Africa",
  678: "Africa", 686: "Africa", 690: "Africa", 694: "Africa", 706: "Africa",
  710: "Africa", 728: "Africa", 654: "Africa", 729: "Africa", 834: "Africa",
  768: "Africa", 788: "Africa", 800: "Africa", 732: "Africa", 894: "Africa",
  716: "Africa", 86: "Africa",

  // ---- Asia ----
  4: "Asia", 51: "Asia", 31: "Asia", 48: "Asia", 50: "Asia", 64: "Asia",
  96: "Asia", 116: "Asia", 156: "Asia", 196: "Asia", 344: "Asia", 356: "Asia",
  360: "Asia", 364: "Asia", 368: "Asia", 376: "Asia", 392: "Asia", 400: "Asia",
  398: "Asia", 414: "Asia", 417: "Asia", 418: "Asia", 422: "Asia", 446: "Asia",
  458: "Asia", 462: "Asia", 496: "Asia", 104: "Asia", 524: "Asia", 408: "Asia",
  512: "Asia", 586: "Asia", 275: "Asia", 608: "Asia", 634: "Asia", 682: "Asia",
  702: "Asia", 410: "Asia", 144: "Asia", 760: "Asia", 158: "Asia", 762: "Asia",
  764: "Asia", 626: "Asia", 792: "Asia", 795: "Asia", 784: "Asia", 860: "Asia",
  704: "Asia", 887: "Asia", 268: "Asia",

  // ---- Europe ----
  248: "Europe", 8: "Europe", 20: "Europe", 40: "Europe", 112: "Europe",
  56: "Europe", 70: "Europe", 100: "Europe", 191: "Europe", 203: "Europe",
  208: "Europe", 233: "Europe", 234: "Europe", 246: "Europe", 250: "Europe",
  276: "Europe", 300: "Europe", 831: "Europe", 348: "Europe", 352: "Europe",
  372: "Europe", 833: "Europe", 380: "Europe", 832: "Europe", 428: "Europe",
  438: "Europe", 440: "Europe", 442: "Europe", 807: "Europe", 470: "Europe",
  498: "Europe", 492: "Europe", 499: "Europe", 528: "Europe", 578: "Europe",
  616: "Europe", 620: "Europe", 642: "Europe", 643: "Europe", 674: "Europe",
  688: "Europe", 703: "Europe", 705: "Europe", 724: "Europe", 752: "Europe",
  756: "Europe", 804: "Europe", 826: "Europe", 336: "Europe",

  // ---- North America ----
  660: "North America", 28: "North America", 533: "North America", 44: "North America",
  52: "North America", 84: "North America", 60: "North America", 92: "North America",
  124: "North America", 136: "North America", 188: "North America", 192: "North America",
  531: "North America", 212: "North America", 214: "North America", 222: "North America",
  304: "North America", 308: "North America", 320: "North America", 332: "North America",
  340: "North America", 388: "North America", 484: "North America", 500: "North America",
  558: "North America", 591: "North America", 630: "North America", 662: "North America",
  534: "North America", 652: "North America", 663: "North America", 659: "North America",
  666: "North America", 670: "North America", 780: "North America", 796: "North America",
  850: "North America", 840: "North America",

  // ---- South America ----
  32: "South America", 68: "South America", 76: "South America", 152: "South America",
  170: "South America", 218: "South America", 238: "South America", 328: "South America",
  600: "South America", 604: "South America", 740: "South America", 858: "South America",
  862: "South America", 239: "South America",

  // ---- Oceania ----
  16: "Oceania", 36: "Oceania", 184: "Oceania", 242: "Oceania", 258: "Oceania",
  316: "Oceania", 296: "Oceania", 584: "Oceania", 583: "Oceania", 580: "Oceania",
  520: "Oceania", 540: "Oceania", 554: "Oceania", 570: "Oceania", 574: "Oceania",
  585: "Oceania", 598: "Oceania", 612: "Oceania", 90: "Oceania", 882: "Oceania",
  776: "Oceania", 548: "Oceania", 876: "Oceania",

  // ---- Antarctica ----
  10: "Antarctica", 260: "Antarctica", 334: "Antarctica"
};
