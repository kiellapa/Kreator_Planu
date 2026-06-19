import React, { useState, useEffect, useRef } from 'react';
import { Save, FolderOpen, Download, Upload, Trash2, Check, AlertCircle } from 'lucide-react';
import type { Room } from '../types';

interface FloorPlanStorageProps {
  rooms: Room[];
  onLoadState: (loadedRooms: Room[]) => void;
}

interface SavedLayout {
  id: string;
  name: string;
  timestamp: string;
  rooms: Room[];
}

export const FloorPlanStorage: React.FC<FloorPlanStorageProps> = ({ rooms, onLoadState }) => {
  const [saveName, setSaveName] = useState('');
  const [localLayouts, setLocalLayouts] = useState<SavedLayout[]>([]);
  const [activeTab, setActiveTab] = useState<'local' | 'file'>('local');
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragActive, setDragActive] = useState(false);

  // Load layouts on build
  useEffect(() => {
    try {
      const stored = localStorage.getItem('kreator_planu_layouts');
      if (stored) {
        setLocalLayouts(JSON.parse(stored));
      }
    } catch (e) {
      console.error("Failed to load saved projects from localStorage", e);
    }
  }, []);

  const triggerSuccess = (msg: string) => {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(null), 3000);
  };

  const triggerError = (msg: string) => {
    setErrorMsg(msg);
    setTimeout(() => setErrorMsg(null), 4000);
  };

  // Save to LocalStorage
  const handleSaveLocal = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = saveName.trim();
    if (!trimmed) {
      triggerError('Podaj nazwę projektu przed zapisaniem!');
      return;
    }

    if (rooms.length === 0) {
      triggerError('Brak pomieszczeń do zapisania!');
      return;
    }

    const newLayout: SavedLayout = {
      id: `layout_${Date.now()}`,
      name: trimmed,
      timestamp: new Date().toLocaleString('pl-PL'),
      rooms: JSON.parse(JSON.stringify(rooms)), // Deep clone
    };

    const updated = [newLayout, ...localLayouts.filter(l => l.name !== trimmed)];
    localStorage.setItem('kreator_planu_layouts', JSON.stringify(updated));
    setLocalLayouts(updated);
    setSaveName('');
    triggerSuccess(`Projekt "${trimmed}" został zapisany pomyślnie!`);
  };

  // Load from LocalStorage
  const handleLoadLocal = (layout: SavedLayout) => {
    if (layout.rooms && Array.isArray(layout.rooms)) {
      onLoadState(layout.rooms);
      triggerSuccess(`Wczytano projekt: "${layout.name}"`);
    } else {
      triggerError('Błąd: ten projekt ma niepoprawną strukturę danych.');
    }
  };

  // Delete from LocalStorage
  const handleDeleteLocal = (id: string, name: string) => {
    const updated = localLayouts.filter(l => l.id !== id);
    localStorage.setItem('kreator_planu_layouts', JSON.stringify(updated));
    setLocalLayouts(updated);
    triggerSuccess(`Usunięto projekt: "${name}"`);
  };

  // Export to JSON File
  const handleExportJson = () => {
    if (rooms.length === 0) {
      triggerError('Brak pomieszczeń do zapisu w pliku!');
      return;
    }

    const payload = {
      generator: "AI Dynamiczny Kreator Planu Piętra",
      version: "1.0",
      exportedAt: new Date().toISOString(),
      rooms: rooms,
    };

    const jsonString = JSON.stringify(payload, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    
    // Create clean download name based on rooms
    const filename = `kreator_planu_kopia_${Date.now()}.json`;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    triggerSuccess('Pobrano plik stanu (.json)');
  };

  // Parse JSON state
  const parseAndApplyStateJson = (text: string) => {
    try {
      const data = JSON.parse(text);
      let roomsList: Room[] | null = null;

      if (Array.isArray(data)) {
        roomsList = data;
      } else if (data && Array.isArray(data.rooms)) {
        roomsList = data.rooms;
      }

      if (!roomsList || roomsList.length === 0) {
        throw new Error('Plik JSON nie zawiera prawidłowej tablicy pomieszczeń (rooms).');
      }

      // Check structure of first item
      const item = roomsList[0];
      if (!item.id || !item.name || !Array.isArray(item.parts)) {
        throw new Error('Niedozwolony format danych w pliku. Pomieszczenia muszą posiadać pola name, id oraz parts.');
      }

      onLoadState(roomsList);
      triggerSuccess(`Pomyślnie zaimportowano ${roomsList.length} pomieszczeń z pliku JSON!`);
    } catch (e: any) {
      console.error(e);
      triggerError(e.message || 'Błąd odczytu pliku JSON. Sprawdź format danych.');
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
        parseAndApplyStateJson(text);
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
        parseAndApplyStateJson(text);
      };
      reader.readAsText(file);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between border-b border-slate-200 pb-2">
        <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-1.5">
          <FolderOpen className="w-4 h-4 text-sky-500" />
          Zapisz / Wczytaj Stan
        </h3>
        
        <div className="flex gap-1 text-[11px] bg-slate-200/80 p-0.5 rounded-lg">
          <button
            type="button"
            onClick={() => setActiveTab('local')}
            className={`px-2 py-1 rounded-md font-semibold transition-all cursor-pointer ${
              activeTab === 'local' ? 'bg-white text-slate-800 shadow-xs' : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            Przeglądarka
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('file')}
            className={`px-2 py-1 rounded-md font-semibold transition-all cursor-pointer ${
              activeTab === 'file' ? 'bg-white text-slate-800 shadow-xs' : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            Plik JSON
          </button>
        </div>
      </div>

      {successMsg && (
        <div className="p-2.5 bg-emerald-50 border border-emerald-200 text-xs text-emerald-700 rounded-lg flex items-center gap-2 animate-fade-in">
          <Check className="w-4 h-4 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {errorMsg && (
        <div className="p-2.5 bg-rose-50 border border-rose-200 text-xs text-rose-700 rounded-lg flex items-center gap-2 animate-fade-in">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {activeTab === 'local' ? (
        <div className="space-y-4">
          <form onSubmit={handleSaveLocal} className="space-y-2">
            <label className="block text-xs font-medium text-slate-500">Zapisz aktualny projekt na dysku przeglądarki</label>
            <div className="flex gap-2">
              <input
                id="saveProjectNameInput"
                type="text"
                value={saveName}
                onChange={(e) => setSaveName(e.target.value)}
                placeholder="Nazwa projektu np. Mój Dom"
                className="flex-grow text-xs px-3 py-2 border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-sky-500 text-slate-800"
              />
              <button
                type="submit"
                className="bg-sky-500 hover:bg-sky-600 text-white font-bold px-3.5 py-2 rounded-lg text-xs flex items-center gap-1 transition-colors cursor-pointer shadow-sm active:scale-95"
              >
                <Save className="w-3.5 h-3.5" />
                Zapisz
              </button>
            </div>
          </form>

          {localLayouts.length > 0 ? (
            <div className="space-y-2">
              <label className="block text-xs font-semibold text-slate-600">Zapisane wersje w przeglądarce:</label>
              <div className="max-h-36 overflow-y-auto space-y-1.5 pr-1 border border-slate-100 rounded-lg p-1.5 bg-slate-50/50">
                {localLayouts.map((layout) => (
                  <div key={layout.id} className="flex items-center justify-between p-2 bg-white rounded-lg border border-slate-200/60 shadow-2xs hover:border-slate-300 transition-all text-xs">
                    <div className="min-w-0 pr-2">
                      <p className="font-bold text-slate-800 truncate" title={layout.name}>{layout.name}</p>
                      <p className="text-[10px] text-slate-400 mt-0.5">{layout.timestamp} • {layout.rooms.length} pom.</p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleLoadLocal(layout)}
                        className="bg-sky-50 text-sky-700 hover:bg-sky-100 font-bold px-2.5 py-1 rounded transition-colors cursor-pointer text-[11px]"
                      >
                        Wczytaj
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteLocal(layout.id, layout.name)}
                        className="text-slate-400 hover:text-rose-600 p-1 rounded hover:bg-slate-50 transition-colors cursor-pointer"
                        title="Usuń wersję"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="text-center py-4 text-xs text-slate-400 border border-dashed border-slate-300 rounded-xl bg-slate-50/30">
              Brak zapisanych projektów w pamięci przeglądarki.
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          <button
            type="button"
            onClick={handleExportJson}
            disabled={rooms.length === 0}
            className={`w-full py-2.5 px-4 rounded-lg font-bold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer shadow-xs ${
              rooms.length > 0 
                ? 'bg-sky-50 hover:bg-sky-100 text-sky-700 border border-sky-200' 
                : 'bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed'
            }`}
          >
            <Download className="w-4 h-4" />
            Pobierz pełną kopię bezpieczeństwa (.json)
          </button>

          <div
            id="storage-dragzone"
            onDragEnter={handleDrag}
            onDragOver={handleDrag}
            onDragLeave={handleDrag}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-xl p-5 text-center cursor-pointer transition-all duration-200 ${
              dragActive
                ? "border-sky-500 bg-sky-50/50"
                : "border-slate-300 hover:border-sky-400 bg-slate-50/50 hover:bg-slate-50"
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".json"
              onChange={handleFileChange}
              className="hidden"
            />
            <Upload className="mx-auto h-7 w-7 text-slate-400 mb-1.5" />
            <p className="text-xs font-semibold text-slate-700">Wczytaj projekt z pliku .json</p>
            <p className="text-[10px] text-slate-400 mt-0.5">Przeciągnij plik kopii lub kliknij tutaj</p>
          </div>
        </div>
      )}
    </div>
  );
};
