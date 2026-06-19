import React, { useState, useRef } from 'react';
import type { Room } from '../types';

interface DiagramImportFormProps {
  onImportRooms: (importedRooms: Room[]) => void;
  pixelsPerMeter: number;
}

interface ParsedSummary {
  buildingName: string;
  description: string;
  roomsCount: number;
  totalArea: number;
  zones: string[];
}

export const DiagramImportForm: React.FC<DiagramImportFormProps> = ({ onImportRooms, pixelsPerMeter }) => {
  const [jsonText, setJsonText] = useState('');
  const [dragActive, setDragActive] = useState(false);
  const [parsedSummary, setParsedSummary] = useState<ParsedSummary | null>(null);
  const [tempRooms, setTempRooms] = useState<Room[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const processJson = (content: string) => {
    try {
      const data = JSON.parse(content);
      setError(null);

      const spaces = data.spaces || data.rooms || [];
      if (!Array.isArray(spaces) || spaces.length === 0) {
        throw new Error("Brak prawidłowych pomieszczeń ('spaces' lub 'rooms') w pliku JSON.");
      }

      // Map zones to colors
      const zoneColors: Record<string, string> = {};
      const zonesList: string[] = [];
      
      const functionalZones = data.functionalZones || (data.buildingType && data.buildingType.zones) || [];
      if (Array.isArray(functionalZones)) {
        functionalZones.forEach((z: any) => {
          if (z && z.name) {
            zonesList.push(z.name);
            if (z.color) {
              zoneColors[z.name] = z.color;
            }
          }
        });
      }

      // Get bounds of diagram coordinates to normalize
      const coordsX = spaces.map((s: any) => s.x ?? s.centerX ?? 0);
      const coordsY = spaces.map((s: any) => s.y ?? s.centerY ?? 0);
      
      const minX = Math.min(...coordsX, 0);
      const maxX = Math.max(...coordsX, 100);
      const minY = Math.min(...coordsY, 0);
      const maxY = Math.max(...coordsY, 100);

      const rangeX = maxX - minX || 500;
      const rangeY = maxY - minY || 500;

      // Fit layout to a comfortable viewport (~1000x800px)
      const targetWidth = 1000;
      const targetHeight = 800;
      const padding = 120; // safe inner margin

      const scaleX = rangeX > 10 ? targetWidth / rangeX : 1.2;
      const scaleY = rangeY > 10 ? targetHeight / rangeY : 1.2;
      const scale = Math.min(scaleX, scaleY, 2.0); // cap max scale to prevent too large spread

      // Standard pallete in case no zone colors are provided
      const PALETTE = [
        'fill-sky-300',
        'fill-emerald-300',
        'fill-amber-300',
        'fill-fuchsia-300',
        'fill-violet-400',
        'fill-cyan-300',
        'fill-indigo-300',
        'fill-teal-300',
      ];

      const mappedRooms: Room[] = spaces.map((s: any, idx: number) => {
        const area = Number(s.area ?? s.targetArea ?? s.plannedArea ?? 15);
        const name = s.name || `Pomieszczenie ${idx + 1}`;
        const zone = s.zone || s.zoneName || '';

        // Calculate size in pixels based on square area
        const sideInMeters = Math.sqrt(area);
        const sideInPixels = sideInMeters * pixelsPerMeter;

        // Position using relational coordinates normalized to positive pixels
        const spaceX = s.x ?? s.centerX ?? 0;
        const spaceY = s.y ?? s.centerY ?? 0;

        const centerX = padding + (spaceX - minX) * scale;
        const centerY = padding + (spaceY - minY) * scale;

        const roomId = `room_imported_${Date.now()}_${idx}`;
        const finalColor = zone && zoneColors[zone] ? zoneColors[zone] : PALETTE[idx % PALETTE.length];

        return {
          id: roomId,
          name,
          targetArea: area,
          color: finalColor,
          parts: [
            {
              id: `${roomId}_part_0`,
              x: centerX - sideInPixels / 2,
              y: centerY - sideInPixels / 2,
              width: sideInPixels,
              height: sideInPixels,
            },
          ],
        };
      });

      // Import customCorridors from circulationConfig as well
      const corridors: Room[] = [];
      if (data.circulationConfig && Array.isArray(data.circulationConfig.customCorridors)) {
        data.circulationConfig.customCorridors.forEach((c: any, cIdx: number) => {
          const area = Number(c.area || 15);
          const ratio = Number(c.aspectRatio || 3);
          const name = c.name || `Korytarz ${cIdx + 1}`;

          // Calculate corridor physical dimensions based on area and aspect ratio
          const heightInMeters = Math.sqrt(area / ratio);
          const widthInMeters = Math.sqrt(area * ratio);

          const widthInPixels = widthInMeters * pixelsPerMeter;
          const heightInPixels = heightInMeters * pixelsPerMeter;

          // Position calculation
          let corridorX = c.x ?? c.centerX;
          let corridorY = c.y ?? c.centerY;

          if (corridorX === undefined || corridorY === undefined) {
            // Find assigned zones
            const assignedZones = Array.isArray(c.assignedZones) ? c.assignedZones : [];
            const matchingSpaces = spaces.filter((s: any) => 
              s && s.zone && assignedZones.some((zName: string) => 
                zName.toLowerCase() === s.zone.toLowerCase()
              )
            );

            if (matchingSpaces.length > 0) {
              const sumX = matchingSpaces.reduce((sum: number, s: any) => sum + (s.x ?? s.centerX ?? 0), 0);
              const sumY = matchingSpaces.reduce((sum: number, s: any) => sum + (s.y ?? s.centerY ?? 0), 0);
              corridorX = sumX / matchingSpaces.length;
              corridorY = sumY / matchingSpaces.length;
            } else {
              // Centroid of all spaces or 0,0
              if (spaces.length > 0) {
                const sumX = spaces.reduce((sum: number, s: any) => sum + (s.x ?? s.centerX ?? 0), 0);
                const sumY = spaces.reduce((sum: number, s: any) => sum + (s.y ?? s.centerY ?? 0), 0);
                corridorX = sumX / spaces.length;
                corridorY = sumY / spaces.length;
              } else {
                corridorX = 0;
                corridorY = 0;
              }
            }
          }

          const centerX = padding + (corridorX - minX) * scale;
          const centerY = padding + (corridorY - minY) * scale;

          const roomId = `room_corridor_${Date.now()}_${cIdx}`;

          // Try to look up a color for "Circulation", or use elegant slate gray #94a3b8
          let circulationColor = '#94a3b8'; // default slate color
          const circZone = functionalZones.find((z: any) => 
            z && z.name && (
              z.name.toLowerCase().includes('circulation') || 
              z.name.toLowerCase().includes('korytarz') || 
              z.name.toLowerCase().includes('skrzydło')
            )
          );
          if (circZone && circZone.color) {
            circulationColor = circZone.color;
          }

          corridors.push({
            id: roomId,
            name,
            targetArea: area,
            color: circulationColor,
            parts: [
              {
                id: `${roomId}_part_0`,
                x: centerX - widthInPixels / 2,
                y: centerY - heightInPixels / 2,
                width: widthInPixels,
                height: heightInPixels,
              },
            ],
          });
        });
      }

      const allMappedRooms = [...mappedRooms, ...corridors];

      // Calculate summaries
      const roomsArea = spaces.reduce((sum: number, s: any) => sum + Number(s.area || 0), 0);
      const corridorsArea = corridors.reduce((sum: number, c: Room) => sum + c.targetArea, 0);
      const totalArea = roomsArea + corridorsArea;

      const buildingName = data.buildingType?.name || data.name || "Zaimportowany Plan";
      const description = data.buildingType?.description || data.description || "Program funkcjonalny wygenerowany z rzutu graficznego.";

      setParsedSummary({
        buildingName,
        description,
        roomsCount: allMappedRooms.length,
        totalArea,
        zones: Array.from(new Set([...spaces.map((s: any) => s.zone), "Circulation"].filter(Boolean))) as string[],
      });

      setTempRooms(allMappedRooms);
      setError(null);
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Błąd podczas przetwarzania pliku JSON. Upewnij się, że format jest prawidłowy.");
      setParsedSummary(null);
      setTempRooms(null);
    }
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      const reader = new FileReader();
      reader.onload = (event) => {
        const text = event.target?.result as string;
        setJsonText(text);
        processJson(text);
      };
      reader.readAsText(file);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const reader = new FileReader();
      reader.onload = (event) => {
        const text = event.target?.result as string;
        setJsonText(text);
        processJson(text);
      };
      reader.readAsText(file);
    }
  };

  const handlePasteChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setJsonText(val);
    if (val.trim()) {
      processJson(val);
    } else {
      setParsedSummary(null);
      setTempRooms(null);
      setError(null);
    }
  };

  const triggerImport = () => {
    if (tempRooms && tempRooms.length > 0) {
      onImportRooms(tempRooms);
      setJsonText('');
      setParsedSummary(null);
      setTempRooms(null);
      setError(null);
    }
  };

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold text-slate-700">Import programu funkcjonalnego</h3>
      
      {/* Drag & Drop Area / Click trigger */}
      <div
        id="import-dragzone"
        onDragEnter={handleDrag}
        onDragOver={handleDrag}
        onDragLeave={handleDrag}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all duration-200 ${
          dragActive
            ? "border-sky-500 bg-sky-50"
            : "border-slate-300 hover:border-sky-400 bg-slate-50/50 hover:bg-slate-50"
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".json,application/json"
          onChange={handleFileChange}
          className="hidden"
        />
        <svg
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={1.5}
          stroke="currentColor"
          className="mx-auto h-10 w-10 text-slate-400 mb-2"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 16.5V9.75m0 0l3 3m-3-3l-3 3M6.75 19.5a4.5 4.5 0 01-1.41-8.775 5.25 5.25 0 0110.233-2.33 3 3 0 013.758 3.848A3.752 3.752 0 0118 19.5H6.75z"
          />
        </svg>
        <p className="text-sm font-medium text-slate-700">Przeciągnij plik diagramu .json</p>
        <p className="text-xs text-slate-500 mt-1">lub kliknij, aby go wybrać z dysku</p>
      </div>

      {/* Alternative: Text Paste area collapsible */}
      <details className="group">
        <summary className="text-xs text-slate-500 hover:text-slate-700 cursor-pointer outline-none select-none">
          Lub wklej zawartość JSON bezpośrednio...
        </summary>
        <div className="mt-3">
          <textarea
            id="jsonPaste"
            value={jsonText}
            onChange={handlePasteChange}
            placeholder="Wklej tutaj wyeksportowany JSON..."
            className="w-full text-xs font-mono p-3 border border-slate-300 rounded-lg h-32 focus:outline-none focus:ring-2 focus:ring-sky-500 bg-white"
          />
        </div>
      </details>

      {/* Error state */}
      {error && (
        <div className="p-3 bg-red-50 border border-red-200 text-xs text-red-600 rounded-lg">
          {error}
        </div>
      )}

      {/* Successful Parsing summary & Import button */}
      {parsedSummary && (
        <div className="p-4 bg-sky-50/80 border border-sky-100 rounded-xl space-y-3">
          <h4 className="text-sm font-bold text-sky-900 border-b border-sky-100 pb-1.5 flex items-center justify-between">
            <span>{parsedSummary.buildingName}</span>
            <span className="text-xs bg-sky-200 text-sky-800 px-2.5 py-0.5 rounded-full font-semibold">
              {parsedSummary.roomsCount} pomieszczeń
            </span>
          </h4>
          
          {parsedSummary.description && (
            <p className="text-xs text-sky-800 italic line-clamp-2">{parsedSummary.description}</p>
          )}

          <div className="grid grid-cols-2 gap-2 text-xs text-sky-900 pt-1">
            <div>
              <span className="text-slate-500 block">Suma powierzchni:</span>
              <strong className="text-sm font-bold text-slate-800">{parsedSummary.totalArea.toFixed(1)} m²</strong>
            </div>
            <div>
              <span className="text-slate-500 block">Unikalne strefy:</span>
              <strong className="text-sm font-bold text-slate-800">{parsedSummary.zones.length || 0}</strong>
            </div>
          </div>

          <button
            type="button"
            onClick={triggerImport}
            className="w-full mt-2 bg-gradient-to-r from-sky-500 to-sky-600 hover:from-sky-600 hover:to-sky-700 text-white font-bold py-2.5 px-4 rounded-lg shadow-md hover:shadow-lg transition-all text-sm flex items-center justify-center gap-1.5"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-4.5 h-4.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            Wygeneruj pomieszczenia na rzucie
          </button>
        </div>
      )}
    </div>
  );
};
