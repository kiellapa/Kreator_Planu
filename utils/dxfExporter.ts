
import type { Room } from '../types';
import { getBoundarySegments, orderSegmentsIntoPolygons } from './geometry';

// Helper to format DXF group codes and values
const group = (code: number, value: string | number) => `${code}\n${value}\n`;

class Handle {
  private count: number;
  constructor(start = 0x300) { // Start handles from a higher number to be safe
    this.count = start;
  }
  next(): string {
    return (this.count++).toString(16).toUpperCase();
  }
  peekNext(): string {
    return this.count.toString(16).toUpperCase();
  }
}

const generateHeader = (extents: { minX: number; minY: number; maxX: number; maxY: number; }, handseed: string) => {
    let header = '';
    header += group(0, 'SECTION');
    header += group(2, 'HEADER');
    header += group(9, '$ACADVER');
    header += group(1, 'AC1015');
    header += group(9, '$ACADMAINTVER');
    header += group(70, 20);
    header += group(9, '$DWGCODEPAGE');
    header += group(3, 'ANSI_1250');
    header += group(9, '$INSBASE');
    header += group(10, 0.0);
    header += group(20, 0.0);
    header += group(30, 0.0);
    header += group(9, '$EXTMIN');
    header += group(10, extents.minX);
    header += group(20, extents.minY);
    header += group(30, 0.0);
    header += group(9, '$EXTMAX');
    header += group(10, extents.maxX);
    header += group(20, extents.maxY);
    header += group(30, 0.0);
    header += group(9, '$LIMMIN');
    header += group(10, 0.0);
    header += group(20, 0.0);
    header += group(9, '$LIMMAX');
    header += group(10, 12.0);
    header += group(20, 9.0);
    header += group(9, '$ORTHOMODE');
    header += group(70, 0);
    header += group(9, '$REGENMODE');
    header += group(70, 1);
    header += group(9, '$FILLMODE');
    header += group(70, 1);
    header += group(9, '$QTEXTMODE');
    header += group(70, 0);
    header += group(9, '$MIRRTEXT');
    header += group(70, 0);
    header += group(9, '$LTSCALE');
    header += group(40, 1.0);
    header += group(9, '$ATTMODE');
    header += group(70, 1);
    header += group(9, '$TEXTSIZE');
    header += group(40, 0.2);
    header += group(9, '$TRACEWID');
    header += group(40, 0.05);
    header += group(9, '$TEXTSTYLE');
    header += group(7, 'STANDARD');
    header += group(9, '$CLAYER');
    header += group(8, 'Pomieszczenia');
    header += group(9, '$CELTYPE');
    header += group(6, 'ByLayer');
    header += group(9, '$CECOLOR');
    header += group(62, 256);
    header += group(9, '$CELTSCALE');
    header += group(40, 1.0);
    header += group(9, '$HANDSEED');
    header += group(5, handseed);
    header += group(9, '$PSTYLEMODE');
    header += group(290, 1);
    header += group(9, '$EXTNAMES');
    header += group(290, 1);
    header += group(0, 'ENDSEC');
    return header;
};

const generateClasses = () => {
    let classes = '';
    classes += group(0, 'SECTION');
    classes += group(2, 'CLASSES');
    classes += group(0, 'CLASS');
    classes += group(1, 'ACDBDICTIONARYWDFLT');
    classes += group(2, 'AcDbDictionaryWithDefault');
    classes += group(3, 'ObjectDBX Classes');
    classes += group(90, 0);
    classes += group(280, 0);
    classes += group(281, 0);
    classes += group(0, 'CLASS');
    classes += group(1, 'ACDBPLACEHOLDER');
    classes += group(2, 'AcDbPlaceHolder');
    classes += group(3, 'ObjectDBX Classes');
    classes += group(90, 0);
    classes += group(280, 0);
    classes += group(281, 0);
    classes += group(0, 'CLASS');
    classes += group(1, 'LAYOUT');
    classes += group(2, 'AcDbLayout');
    classes += group(3, 'ObjectDBX Classes');
    classes += group(90, 0);
    classes += group(280, 0);
    classes += group(281, 0);
    classes += group(0, 'ENDSEC');
    return classes;
}

const generateTables = () => {
    let tables = '';
    tables += group(0, 'SECTION');
    tables += group(2, 'TABLES');
    // VPORT table
    tables += group(0, 'TABLE');
    tables += group(2, 'VPORT');
    tables += group(5, '8');
    tables += group(330, '0');
    tables += group(100, 'AcDbSymbolTable');
    tables += group(70, 1);
    tables += group(0, 'VPORT');
    tables += group(5, '94');
    tables += group(330, '8');
    tables += group(100, 'AcDbSymbolTableRecord');
    tables += group(100, 'AcDbViewportTableRecord');
    tables += group(2, '*Active');
    tables += group(70, 0);
    tables += group(10, 0.0);
    tables += group(20, 0.0);
    tables += group(11, 1.0);
    tables += group(21, 1.0);
    tables += group(12, 10.75);
    tables += group(22, -12.96);
    tables += group(13, 0.0);
    tables += group(23, 0.0);
    tables += group(14, 0.5);
    tables += group(24, 0.5);
    tables += group(15, 0.5);
    tables += group(25, 0.5);
    tables += group(16, 0.0);
    tables += group(26, 0.0);
    tables += group(36, 1.0);
    tables += group(17, 0.0);
    tables += group(27, 0.0);
    tables += group(37, 0.0);
    tables += group(40, 10.0);
    tables += group(41, 2.0);
    tables += group(42, 50.0);
    tables += group(281, 0);
    tables += group(0, 'ENDTAB');
    // LTYPE table
    tables += group(0, 'TABLE');
    tables += group(2, 'LTYPE');
    tables += group(5, '5');
    tables += group(330, '0');
    tables += group(100, 'AcDbSymbolTable');
    tables += group(70, 3);
    tables += group(0, 'LTYPE');
    tables += group(5, '14');
    tables += group(330, '5');
    tables += group(100, 'AcDbSymbolTableRecord');
    tables += group(100, 'AcDbLinetypeTableRecord');
    tables += group(2, 'ByBlock');
    tables += group(70, 0);
    tables += group(3, '');
    tables += group(72, 65);
    tables += group(73, 0);
    tables += group(40, 0.0);
    tables += group(0, 'LTYPE');
    tables += group(5, '15');
    tables += group(330, '5');
    tables += group(100, 'AcDbSymbolTableRecord');
    tables += group(100, 'AcDbLinetypeTableRecord');
    tables += group(2, 'ByLayer');
    tables += group(70, 0);
    tables += group(3, '');
    tables += group(72, 65);
    tables += group(73, 0);
    tables += group(40, 0.0);
    tables += group(0, 'LTYPE');
    tables += group(5, '16');
    tables += group(330, '5');
    tables += group(100, 'AcDbSymbolTableRecord');
    tables += group(100, 'AcDbLinetypeTableRecord');
    tables += group(2, 'Continuous');
    tables += group(70, 0);
    tables += group(3, 'Solid line');
    tables += group(72, 65);
    tables += group(73, 0);
    tables += group(40, 0.0);
    tables += group(0, 'ENDTAB');
    // LAYER table
    tables += group(0, 'TABLE');
    tables += group(2, 'LAYER');
    tables += group(5, '2');
    tables += group(330, '0');
    tables += group(100, 'AcDbSymbolTable');
    tables += group(70, 2);
    tables += group(0, 'LAYER');
    tables += group(5, '10');
    tables += group(330, '2');
    tables += group(100, 'AcDbSymbolTableRecord');
    tables += group(100, 'AcDbLayerTableRecord');
    tables += group(2, '0');
    tables += group(70, 0);
    tables += group(62, 7);
    tables += group(6, 'Continuous');
    tables += group(390, 'F');
    tables += group(0, 'LAYER');
    tables += group(5, '249');
    tables += group(330, '2');
    tables += group(100, 'AcDbSymbolTableRecord');
    tables += group(100, 'AcDbLayerTableRecord');
    tables += group(2, 'Pomieszczenia');
    tables += group(70, 0);
    tables += group(62, 7);
    tables += group(6, 'Continuous');
    tables += group(390, 'F');
    tables += group(0, 'ENDTAB');
    // STYLE table
    tables += group(0, 'TABLE');
    tables += group(2, 'STYLE');
    tables += group(5, '3');
    tables += group(330, '0');
    tables += group(100, 'AcDbSymbolTable');
    tables += group(70, 1);
    tables += group(0, 'STYLE');
    tables += group(5, '11');
    tables += group(330, '3');
    tables += group(100, 'AcDbSymbolTableRecord');
    tables += group(100, 'AcDbTextStyleTableRecord');
    tables += group(2, 'STANDARD');
    tables += group(70, 0);
    tables += group(40, 0.0);
    tables += group(41, 1.0);
    tables += group(50, 0.0);
    tables += group(71, 0);
    tables += group(42, 0.2);
    tables += group(3, 'txt.shx');
    tables += group(4, '');
    tables += group(0, 'ENDTAB');
    // VIEW table
    tables += group(0, 'TABLE');
    tables += group(2, 'VIEW');
    tables += group(5, '6');
    tables += group(330, '0');
    tables += group(100, 'AcDbSymbolTable');
    tables += group(70, 0);
    tables += group(0, 'ENDTAB');
    // UCS table
    tables += group(0, 'TABLE');
    tables += group(2, 'UCS');
    tables += group(5, '7');
    tables += group(330, '0');
    tables += group(100, 'AcDbSymbolTable');
    tables += group(70, 0);
    tables += group(0, 'ENDTAB');
    // APPID table
    tables += group(0, 'TABLE');
    tables += group(2, 'APPID');
    tables += group(5, '9');
    tables += group(330, '0');
    tables += group(100, 'AcDbSymbolTable');
    tables += group(70, 1);
    tables += group(0, 'APPID');
    tables += group(5, '12');
    tables += group(330, '9');
    tables += group(100, 'AcDbSymbolTableRecord');
    tables += group(100, 'AcDbRegAppTableRecord');
    tables += group(2, 'ACAD');
    tables += group(70, 0);
    tables += group(0, 'ENDTAB');
    // DIMSTYLE table
    tables += group(0, 'TABLE');
    tables += group(2, 'DIMSTYLE');
    tables += group(5, 'A');
    tables += group(330, '0');
    tables += group(100, 'AcDbSymbolTable');
    tables += group(70, 1);
    tables += group(100, 'AcDbDimStyleTable');
    tables += group(71, 1);
    tables += group(340, '27');
    tables += group(0, 'DIMSTYLE');
    tables += group(105, '27');
    tables += group(330, 'A');
    tables += group(100, 'AcDbSymbolTableRecord');
    tables += group(100, 'AcDbDimStyleTableRecord');
    tables += group(2, 'Standard');
    tables += group(70, 0);
    tables += group(0, 'ENDTAB');
    // BLOCK_RECORD table
    tables += group(0, 'TABLE');
    tables += group(2, 'BLOCK_RECORD');
    tables += group(5, '1');
    tables += group(330, '0');
    tables += group(100, 'AcDbSymbolTable');
    tables += group(70, 2);
    tables += group(0, 'BLOCK_RECORD');
    tables += group(5, '1F');
    tables += group(330, '1');
    tables += group(100, 'AcDbSymbolTableRecord');
    tables += group(100, 'AcDbBlockTableRecord');
    tables += group(2, '*Model_Space');
    tables += group(0, 'BLOCK_RECORD');
    tables += group(5, '58');
    tables += group(330, '1');
    tables += group(100, 'AcDbSymbolTableRecord');
    tables += group(100, 'AcDbBlockTableRecord');
    tables += group(2, '*Paper_Space');
    tables += group(0, 'ENDTAB');
    tables += group(0, 'ENDSEC');
    return tables;
}

const generateBlocks = () => {
    let blocks = '';
    blocks += group(0, 'SECTION');
    blocks += group(2, 'BLOCKS');
    blocks += group(0, 'BLOCK');
    blocks += group(5, '20');
    blocks += group(330, '1F');
    blocks += group(100, 'AcDbEntity');
    blocks += group(8, '0');
    blocks += group(100, 'AcDbBlockBegin');
    blocks += group(2, '*Model_Space');
    blocks += group(70, 0);
    blocks += group(10, 0.0);
    blocks += group(20, 0.0);
    blocks += group(30, 0.0);
    blocks += group(3, '*Model_Space');
    blocks += group(1, '');
    blocks += group(0, 'ENDBLK');
    blocks += group(5, '21');
    blocks += group(330, '1F');
    blocks += group(100, 'AcDbEntity');
    blocks += group(8, '0');
    blocks += group(100, 'AcDbBlockEnd');
    blocks += group(0, 'BLOCK');
    blocks += group(5, '5A');
    blocks += group(330, '58');
    blocks += group(100, 'AcDbEntity');
    blocks += group(67, 1);
    blocks += group(8, '0');
    blocks += group(100, 'AcDbBlockBegin');
    blocks += group(2, '*Paper_Space');
    blocks += group(70, 0);
    blocks += group(10, 0.0);
    blocks += group(20, 0.0);
    blocks += group(30, 0.0);
    blocks += group(3, '*Paper_Space');
    blocks += group(1, '');
    blocks += group(0, 'ENDBLK');
    blocks += group(5, '5B');
    blocks += group(330, '58');
    blocks += group(100, 'AcDbEntity');
    blocks += group(67, 1);
    blocks += group(8, '0');
    blocks += group(100, 'AcDbBlockEnd');
    blocks += group(0, 'ENDSEC');
    return blocks;
}

const generateEntities = (rooms: Room[], pixelsPerMeter: number, handle: Handle) => {
    let entities = '';
    entities += group(0, 'SECTION');
    entities += group(2, 'ENTITIES');

    for (const room of rooms) {
        if (room.parts.length === 0) continue;

        const boundarySegments = getBoundarySegments(room.parts);
        const polygons = orderSegmentsIntoPolygons(boundarySegments);

        for (const polygon of polygons) {
            if (polygon.length === 0) continue;
            entities += group(0, 'LWPOLYLINE');
            entities += group(5, handle.next());
            entities += group(330, '1F');
            entities += group(100, 'AcDbEntity');
            entities += group(8, 'Pomieszczenia');
            entities += group(100, 'AcDbPolyline');
            entities += group(90, polygon.length);
            entities += group(70, 1);

            for (const point of polygon) {
                entities += group(10, point.x / pixelsPerMeter);
                entities += group(20, -point.y / pixelsPerMeter); // Invert Y for CAD
            }
        }

        let largestPart = room.parts[0];
        let maxArea = 0;
        let totalArea = 0;
        room.parts.forEach(p => {
            const area = p.width * p.height;
            totalArea += area;
            if (area > maxArea) {
                maxArea = area;
                largestPart = p;
            }
        });

        const centerX = (largestPart.x + largestPart.width / 2) / pixelsPerMeter;
        const centerY = -(largestPart.y + largestPart.height / 2) / pixelsPerMeter;
        const currentAreaM2 = totalArea / (pixelsPerMeter * pixelsPerMeter);
        
        const widthInMeters = largestPart.width / pixelsPerMeter;
        const heightInMeters = largestPart.height / pixelsPerMeter;

        let nameHeight = 0.25;
        let areaHeight = 0.18;

        const nameLen = room.name.length;
        const areaText = `${currentAreaM2.toFixed(1)} m2`;
        const areaLen = areaText.length;

        const maxTextWidthInMeters = widthInMeters * 0.85;

        const estNameWidthDefault = nameLen * nameHeight * 0.72;
        if (estNameWidthDefault > maxTextWidthInMeters) {
            nameHeight = maxTextWidthInMeters / (nameLen * 0.72);
        }

        const estAreaWidthDefault = areaLen * areaHeight * 0.72;
        if (estAreaWidthDefault > maxTextWidthInMeters) {
            areaHeight = maxTextWidthInMeters / (areaLen * 0.72);
        }

        const spacing = nameHeight * 0.55;
        const estTotalHeight = nameHeight + areaHeight + spacing;
        const maxVerticalInMeters = heightInMeters * 0.85;
        if (estTotalHeight > maxVerticalInMeters) {
            const verticalScale = maxVerticalInMeters / estTotalHeight;
            nameHeight *= verticalScale;
            areaHeight *= verticalScale;
        }

        nameHeight = Math.max(0.04, nameHeight);
        areaHeight = Math.max(0.03, areaHeight);

        const roomNameWidth = nameLen * nameHeight * 0.72;
        const nameX = centerX - (roomNameWidth / 2);
        const nameY = centerY + (nameHeight / 4);

        entities += group(0, 'TEXT');
        entities += group(5, handle.next());
        entities += group(330, '1F');
        entities += group(100, 'AcDbEntity');
        entities += group(8, 'Pomieszczenia');
        entities += group(100, 'AcDbText');
        entities += group(10, nameX);
        entities += group(20, nameY);
        entities += group(40, nameHeight);
        entities += group(1, room.name);
        entities += group(100, 'AcDbText');

        const areaTextWidth = areaLen * areaHeight * 0.72;
        const areaX = centerX - (areaTextWidth / 2);
        const areaY = nameY - nameHeight - (nameHeight * 0.3);
        
        entities += group(0, 'TEXT');
        entities += group(5, handle.next());
        entities += group(330, '1F');
        entities += group(100, 'AcDbEntity');
        entities += group(8, 'Pomieszczenia');
        entities += group(100, 'AcDbText');
        entities += group(10, areaX);
        entities += group(20, areaY);
        entities += group(40, areaHeight);
        entities += group(1, areaText);
        entities += group(100, 'AcDbText');
    }

    entities += group(0, 'ENDSEC');
    return entities;
};

const generateObjects = () => {
    let objects = '';
    objects += group(0, 'SECTION');
    objects += group(2, 'OBJECTS');
    objects += group(0, 'DICTIONARY');
    objects += group(5, 'C');
    objects += group(330, '0');
    objects += group(100, 'AcDbDictionary');
    objects += group(281, 1);
    objects += group(3, 'ACAD_GROUP');
    objects += group(350, 'D');
    objects += group(3, 'ACAD_LAYOUT');
    objects += group(350, '1A');
    objects += group(3, 'ACAD_MLINESTYLE');
    objects += group(350, '17');
    objects += group(3, 'ACAD_PLOTSETTINGS');
    objects += group(350, '19');
    objects += group(3, 'ACAD_PLOTSTYLENAME');
    objects += group(350, 'E');
    objects += group(0, 'DICTIONARY');
    objects += group(5, 'D');
    objects += group(330, 'C');
    objects += group(100, 'AcDbDictionary');
    objects += group(281, 1);
    objects += group(0, 'DICTIONARY');
    objects += group(5, '1A');
    objects += group(330, 'C');
    objects += group(100, 'AcDbDictionary');
    objects += group(281, 1);
    objects += group(3, 'Layout1');
    objects += group(350, '59');
    objects += group(3, 'Layout2');
    objects += group(350, '5E');
    objects += group(3, 'Model');
    objects += group(350, '22');
    objects += group(0, 'MLINESTYLE');
    objects += group(5, '18');
    objects += group(330, '17');
    objects += group(100, 'AcDbMlineStyle');
    objects += group(2, 'STANDARD');
    objects += group(70, 0);
    objects += group(3, '');
    objects += group(62, 256);
    objects += group(51, 90.0);
    objects += group(52, 90.0);
    objects += group(71, 2);
    objects += group(49, 0.5);
    objects += group(62, 256);
    objects += group(6, 'BYLAYER');
    objects += group(49, -0.5);
    objects += group(62, 256);
    objects += group(6, 'BYLAYER');
    objects += group(0, 'DICTIONARY');
    objects += group(5, '17');
    objects += group(330, 'C');
    objects += group(100, 'AcDbDictionary');
    objects += group(281, 1);
    objects += group(3, 'Standard');
    objects += group(350, '18');
    objects += group(0, 'DICTIONARY');
    objects += group(5, '19');
    objects += group(330, 'C');
    objects += group(100, 'AcDbDictionary');
    objects += group(281, 1);
    objects += group(0, 'ACDBDICTIONARYWDFLT');
    objects += group(5, 'E');
    objects += group(330, 'C');
    objects += group(100, 'AcDbDictionary');
    objects += group(281, 1);
    objects += group(3, 'Normal');
    objects += group(350, 'F');
    objects += group(100, 'AcDbDictionaryWithDefault');
    objects += group(340, 'F');
    objects += group(0, 'ACDBPLACEHOLDER');
    objects += group(5, 'F');
    objects += group(330, 'E');
    objects += group(0, 'LAYOUT');
    objects += group(5, '59');
    objects += group(330, '1A');
    objects += group(100, 'AcDbPlotSettings');
    objects += group(1, '');
    objects += group(2, 'None');
    objects += group(4, '');
    objects += group(6, '');
    objects += group(40, 0.0);
    objects += group(41, 0.0);
    objects += group(42, 0.0);
    objects += group(43, 0.0);
    objects += group(44, 0.0);
    objects += group(45, 0.0);
    objects += group(46, 0.0);
    objects += group(47, 0.0);
    objects += group(48, 0.0);
    objects += group(49, 0.0);
    objects += group(140, 0.0);
    objects += group(141, 0.0);
    objects += group(142, 1.0);
    objects += group(143, 1.0);
    objects += group(70, 688);
    objects += group(72, 0);
    objects += group(73, 0);
    objects += group(74, 5);
    objects += group(7, '');
    objects += group(75, 16);
    objects += group(147, 1.0);
    objects += group(148, 0.0);
    objects += group(149, 0.0);
    objects += group(100, 'AcDbLayout');
    objects += group(1, 'Layout1');
    objects += group(70, 1);
    objects += group(71, 1);
    objects += group(10, 0.0);
    objects += group(20, 0.0);
    objects += group(11, 12.0);
    objects += group(21, 9.0);
    objects += group(12, 0.0);
    objects += group(22, 0.0);
    objects += group(14, 0.0);
    objects += group(24, 0.0);
    objects += group(15, 0.0);
    objects += group(25, 0.0);
    objects += group(146, 0.0);
    objects += group(76, 0);
    objects += group(330, '58');
    objects += group(0, 'LAYOUT');
    objects += group(5, '5E');
    objects += group(330, '1A');
    objects += group(100, 'AcDbPlotSettings');
    objects += group(1, '');
    objects += group(2, 'None');
    objects += group(4, '');
    objects += group(6, '');
    objects += group(40, 0.0);
    objects += group(41, 0.0);
    objects += group(42, 0.0);
    objects += group(43, 0.0);
    objects += group(44, 0.0);
    objects += group(45, 0.0);
    objects += group(46, 0.0);
    objects += group(47, 0.0);
    objects += group(48, 0.0);
    objects += group(49, 0.0);
    objects += group(140, 0.0);
    objects += group(141, 0.0);
    objects += group(142, 1.0);
    objects += group(143, 1.0);
    objects += group(70, 688);
    objects += group(72, 0);
    objects += group(73, 0);
    objects += group(74, 5);
    objects += group(7, '');
    objects += group(75, 16);
    objects += group(147, 1.0);
    objects += group(148, 0.0);
    objects += group(149, 0.0);
    objects += group(100, 'AcDbLayout');
    objects += group(1, 'Layout2');
    objects += group(70, 1);
    objects += group(71, 2);
    objects += group(10, 0.0);
    objects += group(20, 0.0);
    objects += group(11, 12.0);
    objects += group(21, 9.0);
    objects += group(12, 0.0);
    objects += group(22, 0.0);
    objects += group(14, 0.0);
    objects += group(24, 0.0);
    objects += group(15, 0.0);
    objects += group(25, 0.0);
    objects += group(146, 0.0);
    objects += group(76, 0);
    objects += group(330, '5D');
    objects += group(0, 'LAYOUT');
    objects += group(5, '22');
    objects += group(330, '1A');
    objects += group(100, 'AcDbPlotSettings');
    objects += group(1, '');
    objects += group(2, 'none_device');
    objects += group(4, 'ANSI_A_(8.50_x_11.00_Inches)');
    objects += group(6, '');
    objects += group(70, 11952);
    objects += group(72, 0);
    objects += group(73, 1);
    objects += group(74, 0);
    objects += group(75, 0);
    objects += group(100, 'AcDbLayout');
    objects += group(1, 'Model');
    objects += group(70, 1);
    objects += group(71, 0);
    objects += group(10, 0.0);
    objects += group(20, 0.0);
    objects += group(11, 12.0);
    objects += group(21, 9.0);
    objects += group(12, 0.0);
    objects += group(22, 0.0);
    objects += group(14, 0.0);
    objects += group(24, 0.0);
    objects += group(15, 0.0);
    objects += group(25, 0.0);
    objects += group(146, 0.0);
    objects += group(76, 0);
    objects += group(330, '1F');
    objects += group(331, '94');
    objects += group(0, 'ENDSEC');
    return objects;
}

export const exportToDxf = (rooms: Room[], pixelsPerMeter: number): string => {
  const handle = new Handle(0x300);

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const allParts = rooms.flatMap(r => r.parts);

  if (allParts.length > 0) {
      for (const part of allParts) {
          minX = Math.min(minX, part.x);
          minY = Math.min(minY, part.y);
          maxX = Math.max(maxX, part.x + part.width);
          maxY = Math.max(maxY, part.y + part.height);
      }
  } else {
      minX = 0; minY = 0; maxX = 100; maxY = 100;
  }
  
  const extents = {
      minX: minX / pixelsPerMeter,
      minY: -maxY / pixelsPerMeter, // Inverted Y for CAD
      maxX: maxX / pixelsPerMeter,
      maxY: -minY / pixelsPerMeter, // Inverted Y for CAD
  };
  
  const entitiesSection = generateEntities(rooms, pixelsPerMeter, handle);
  const nextHandleForSeed = handle.peekNext();
  
  let dxf = '';
  dxf += generateHeader(extents, nextHandleForSeed);
  dxf += generateClasses();
  dxf += generateTables();
  dxf += generateBlocks();
  dxf += entitiesSection;
  dxf += generateObjects();
  dxf += group(0, 'EOF');

  return dxf;
};
