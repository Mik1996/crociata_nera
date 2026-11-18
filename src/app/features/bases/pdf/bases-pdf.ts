/**
 * A book of defense bases to export as a PDF (`BasesPdfExporter`): a cover (picture, title, the
 * clan's name at the top), then one page per base with its town hall, screenshot, in-game link (as
 * a QR code too), clan castle reinforcements and description. Composed in the "Create bases PDF"
 * editor; every text is already translated.
 */
export interface BasesPdf {
  /** File name without extension, e.g. `crociata-nera-basi-2026-11-18`. */
  fileName: string;
  title: string;
  cover: BasesPdfCover;
  pages: readonly BasesPdfPage[];
  labels: BasesPdfLabels;
}

/** Texts of the cover; its picture is the file picked in the editor (`BasesPdfExporter`). */
export interface BasesPdfCover {
  /** Small line above the title, e.g. `Arsenale basi`. */
  kicker: string;
  /** Line under the title, e.g. `12 basi · municipio 17–15`. */
  summary: string;
}

export interface BasesPdfPage {
  townHallLevel: number;
  /** URL of the town hall picture, relative to the site; `null` when there is none. */
  townHallImage: string | null;
  /** URL of the full screenshot of the base. */
  image: string;
  /** In-game "copy base" link. */
  layoutUrl: string;
  troops: readonly BasesPdfTroop[];
  /** Housing space of the reinforcements, e.g. `45/50 spazi`. */
  castleSpace: string;
  /** Optional: an empty text leaves the section out. */
  description: string;
  /** `Municipio 17`. */
  heading: string;
  /** `Base 3 di 12`. */
  counter: string;
}

export interface BasesPdfTroop {
  name: string;
  count: number;
  /** URL of the troop picture, relative to the site; `null`: the name alone. */
  icon: string | null;
}

/** Texts shared by every base page. */
export interface BasesPdfLabels {
  castle: string;
  noTroops: string;
  /** The link to the base in the game, written big and clickable, e.g. `Link base`. */
  link: string;
  /** Under the QR code, e.g. `Inquadra il codice o tocca «Link base»`. */
  scan: string;
  description: string;
}

/** Pictures made by the exporter for the whole document, as PNG/JPEG data URLs. */
export interface BasesPdfArt {
  /** The cover picture shaped for the page; `null`: a plain dark cover. */
  cover: string | null;
  /** Brushed iron behind every base page (`PdfToolkit.ironPlate`); `null`: plain dark pages. */
  page: string | null;
}

/** Every picture of the pages, by kind (they are loaded at different sizes and formats). */
export function basesPdfImageUrls(pdf: BasesPdf): { screenshots: string[]; icons: string[] } {
  const screenshots = new Set<string>();
  const icons = new Set<string>();
  for (const page of pdf.pages) {
    screenshots.add(page.image);
    if (page.townHallImage) icons.add(page.townHallImage);
    for (const troop of page.troops) if (troop.icon) icons.add(troop.icon);
  }
  return { screenshots: [...screenshots], icons: [...icons] };
}
