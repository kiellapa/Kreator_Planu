import React, { useState, useCallback, useRef } from 'react';
import { RoomForm } from './components/RoomForm';
import { AIForm } from './components/AIForm';
import { FloorPlanCanvas } from './components/FloorPlanCanvas';
import { DiagramImportForm } from './components/DiagramImportForm';
import { FloorPlanStorage } from './components/FloorPlanStorage';
import type { Room } from './types';
import { exportToDxf } from './utils/dxfExporter';

const PIXELS_PER_METER = 20;

const ROOM_COLORS = [
  'fill-sky-300',
  'fill-emerald-300',
  'fill-amber-300',
  'fill-fuchsia-300',
  'fill-violet-400',
  'fill-cyan-300',
  'fill-indigo-300',
  'fill-teal-300',
];

const App: React.FC = () => {
  const [rooms, setRooms] = useState<Room[]>([]);
  const historyRef = useRef<Room[][]>([]);
  const futureRef = useRef<Room[][]>([]);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [isInstructionsCollapsed, setIsInstructionsCollapsed] = useState(false);

  const updateUndoRedoState = () => {
    setCanUndo(historyRef.current.length > 0);
    setCanRedo(futureRef.current.length > 0);
  };

  const pushToHistory = useCallback((stateToPush: Room[]) => {
    historyRef.current.push(stateToPush);
    futureRef.current = [];
    updateUndoRedoState();
  }, []);
  
  const handleUndo = useCallback(() => {
    if (historyRef.current.length > 0) {
      const previousState = historyRef.current.pop();
      futureRef.current.unshift(rooms);
      setRooms(previousState!);
      updateUndoRedoState();
    }
  }, [rooms]);
  
  const handleRedo = useCallback(() => {
    if (futureRef.current.length > 0) {
      const nextState = futureRef.current.shift();
      historyRef.current.push(rooms);
      setRooms(nextState!);
      updateUndoRedoState();
    }
  }, [rooms]);

  const handleAddRoom = useCallback((name: string, area: number, roomCountOffset = 0) => {
     setRooms((prevRooms) => {
        pushToHistory(prevRooms);
        const sideInMeters = Math.sqrt(area);
        const sideInPixels = sideInMeters * PIXELS_PER_METER;
        const newRoomId = `room_${Date.now()}_${roomCountOffset}`;
        const currentRoomCount = prevRooms.length + roomCountOffset;

        const newRoom: Room = {
          id: newRoomId,
          name,
          targetArea: area,
          color: ROOM_COLORS[currentRoomCount % ROOM_COLORS.length],
          parts: [
            {
              id: `${newRoomId}_part_0`,
              x: 20 + (currentRoomCount % 5) * 40,
              y: 20 + (currentRoomCount % 5) * 40,
              width: sideInPixels,
              height: sideInPixels,
            },
          ],
        };
        return [...prevRooms, newRoom];
     });
  }, [pushToHistory]);
  
  const handleAiAddRooms = useCallback((roomsFromAi: { name: string, area: number }[]) => {
      setRooms(prevRooms => {
        pushToHistory(prevRooms);
        let currentRooms = [...prevRooms];
        roomsFromAi.forEach((roomData, index) => {
            const sideInMeters = Math.sqrt(roomData.area);
            const sideInPixels = sideInMeters * PIXELS_PER_METER;
            const newRoomId = `room_${Date.now()}_${index}`;
            const currentRoomCount = currentRooms.length;

            const newRoom: Room = {
                id: newRoomId,
                name: roomData.name,
                targetArea: roomData.area,
                color: ROOM_COLORS[currentRoomCount % ROOM_COLORS.length],
                parts: [{
                    id: `${newRoomId}_part_0`,
                    x: 20 + (currentRoomCount % 5) * 40,
                    y: 20 + (currentRoomCount % 5) * 40,
                    width: sideInPixels,
                    height: sideInPixels,
                }],
            };
            currentRooms.push(newRoom);
        });
        return currentRooms;
      });
  }, [pushToHistory]);

  const handleImportRooms = useCallback((importedRooms: Room[]) => {
    setRooms(prevRooms => {
      pushToHistory(prevRooms);
      return importedRooms;
    });
  }, [pushToHistory]);

  const handleDeleteRoom = useCallback((roomId: string) => {
    setRooms(prevRooms => {
        pushToHistory(prevRooms);
        return prevRooms.filter(room => room.id !== roomId)
    });
  }, [pushToHistory]);

  const handleDuplicateRoom = useCallback((roomId: string) => {
    setRooms(prevRooms => {
        const roomToDuplicate = prevRooms.find(room => room.id === roomId);
        if (!roomToDuplicate) return prevRooms;
        pushToHistory(prevRooms);

        const newRoomId = `room_${Date.now()}`;
        const duplicatedRoom: Room = {
          ...roomToDuplicate,
          id: newRoomId,
          color: ROOM_COLORS[prevRooms.length % ROOM_COLORS.length],
          parts: roomToDuplicate.parts.map((part, index) => ({
            ...part,
            id: `${newRoomId}_part_${index}`,
            x: part.x + 20,
            y: part.y + 20,
          })),
        };
        return [...prevRooms, duplicatedRoom];
    });
  }, [pushToHistory]);

  const handleRenameRoom = useCallback((roomId: string, newName: string) => {
    setRooms(prevRooms => {
        pushToHistory(prevRooms);
        return prevRooms.map(room => 
            room.id === roomId ? { ...room, name: newName } : room
        );
    });
  }, [pushToHistory]);

  const handleReset = () => {
    setRooms(prevRooms => {
        if(prevRooms.length > 0) {
            pushToHistory(prevRooms);
        }
        return [];
    });
  };

  const handleExportDxf = () => {
    const dxfContent = exportToDxf(rooms, PIXELS_PER_METER);
    const blob = new Blob([dxfContent], { type: 'application/dxf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'plan.dxf';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-col md:flex-row h-screen font-sans text-slate-800 antialiased">
      <div 
        className="w-full md:w-96 p-6 flex-shrink-0 border-r border-slate-200 z-10 overflow-y-auto bg-no-repeat bg-cover"
        style={{
          backgroundColor: '#e0f2fe',
          backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 384 800' preserveAspectRatio='xMidYMax slice'%3E%3Cdefs%3E%3Cfilter id='shadow' x='-20%25' y='-20%25' width='140%25' height='140%25'%3E%3CfeDropShadow dx='2' dy='3' stdDeviation='2.5' flood-color='%23000' flood-opacity='0.08'/%3E%3C/filter%3E%3C/defs%3E%3Cg style='filter:url(%23shadow)'%3E%3Cpath fill='%23f1f5f9' d='M0 800H384V750C300 770 150 720 0 760V800Z'/%3E%3Cpath fill='%23e2e8f0' d='M0 800H384V720C280 750 180 700 0 730V800Z'/%3E%3Cpath fill='%23fef2f2' d='M200 680 L240 650 L280 680V740H200V680Z'/%3E%3Cpath fill='%23fee2e2' d='M205 685 L240 658 L275 685V735H205V685Z'/%3E%3Cpath fill='%23dbeafe' d='M80 700 L110 680 L140 700V760H80V700Z'/%3E%3Cpath fill='%23bfdbfe' d='M85 703 L110 685 L135 703V755H85V703Z'/%3E%3Cpath fill='%23fefce8' d='M150 710 L170 695 L190 710V750H150V710Z'/%3E%3Cpath fill='%23fef9c3' d='M153 712 L170 699 L187 712V747H153V712Z'/%3E%3Cpath fill='white' d='M290 600 A 30 30 0 0 1 230 600 A 20 20 0 0 1 290 600 Z'/%3E%3Cpath fill='white' d='M60 650 A 25 25 0 0 1 10 650 A 15 15 0 0 1 60 650 Z'/%3E%3C/g%3E%3C/svg%3E")`,
          backgroundPosition: 'bottom center',
        }}
      >
        <header className="mb-8 text-center">
          <h1 className="text-4xl font-bold text-slate-900">Kreator Planu</h1>
          <p className="text-sm text-slate-500 mt-1">Stwórz swój nowoczesny plan piętra!</p>
        </header>
        
        <div className="p-4 bg-white/70 rounded-xl shadow-sm backdrop-blur-sm">
            <RoomForm onAddRoom={(name, area) => handleAddRoom(name, area)} />
        </div>


        <div className="my-6 border-t border-slate-300/80"></div>
        
        <div className="p-4 bg-white/70 rounded-xl shadow-sm backdrop-blur-sm">
            <AIForm onAddRooms={handleAiAddRooms} />
        </div>

        <div className="my-6 border-t border-slate-300/80"></div>
        
        <div className="p-4 bg-white/70 rounded-xl shadow-sm backdrop-blur-sm">
            <DiagramImportForm onImportRooms={handleImportRooms} pixelsPerMeter={PIXELS_PER_METER} />
        </div>

        <div className="my-6 border-t border-slate-300/80"></div>

        <div className="p-4 bg-white/70 rounded-xl shadow-sm backdrop-blur-sm">
            <FloorPlanStorage rooms={rooms} onLoadState={handleImportRooms} />
        </div>
        
        <div className="mt-6 space-y-3">
           <button
            onClick={handleExportDxf}
            className="w-full bg-sky-500 hover:bg-sky-600 text-white font-bold py-2 px-4 rounded-lg shadow-md hover:shadow-lg transition-all"
          >
            Eksportuj jako DXF
          </button>
          <button
            onClick={handleReset}
            className="w-full bg-rose-500 hover:bg-rose-600 text-white font-bold py-2 px-4 rounded-lg shadow-md hover:shadow-lg transition-all"
          >
            Wyczyść wszystko
          </button>
        </div>
         <div className="mt-8 text-sm text-slate-600 space-y-2 bg-slate-100/70 backdrop-blur-sm p-4 rounded-lg">
          <div className="flex justify-between items-center cursor-pointer" onClick={() => setIsInstructionsCollapsed(!isInstructionsCollapsed)}>
            <h3 className="font-bold text-slate-800 text-base">Instrukcje:</h3>
            <button 
                className="p-1 rounded-full hover:bg-slate-200/80 transition-colors"
                aria-label={isInstructionsCollapsed ? "Rozwiń instrukcje" : "Zwiń instrukcje"}
            >
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={`transition-transform duration-300 ${isInstructionsCollapsed ? 'rotate-0' : 'rotate-180'}`}>
                    <path d="m6 9 6 6 6-6"/>
                </svg>
            </button>
          </div>
          <div className={`transition-all duration-300 ease-in-out overflow-hidden ${isInstructionsCollapsed ? 'max-h-0' : 'max-h-96'}`}>
            <ul className="list-disc list-inside space-y-2 pt-2">
                <li><span className="font-semibold">Dodaj:</span> Wpisz nazwę i powierzchnię.</li>
                <li><span className="font-semibold">Generuj AI:</span> Opisz plan i pozwól AI go stworzyć.</li>
                <li><span className="font-semibold">Przesuń:</span> Kliknij i przeciągnij pomieszczenie.</li>
                <li><span className="font-semibold">Zmień rozmiar:</span> Przeciągnij narożnik lub krawędź.</li>
                <li><span className="font-semibold">Przyciąganie:</span> Krawędzie przyciągają się do siebie.</li>
                <li><span className="font-semibold">Opcje:</span> Prawy przycisk myszy na pokoju.</li>
                <li><span className="font-semibold">Import JSON:</span> Przeciągnij plik diagramu programu, by rozmieścić pomieszczenia.</li>
                <li><span className="font-semibold">Zapis/Wczytaj Stan:</span> Zapisuj projekty w przeglądarce lub pobieraj jako pliki JSON.</li>
            </ul>
          </div>
        </div>
      </div>
      <main className="flex-grow p-4">
        <FloorPlanCanvas 
            rooms={rooms} 
            onRoomsUpdate={setRooms} 
            pixelsPerMeter={PIXELS_PER_METER} 
            onDeleteRoom={handleDeleteRoom}
            onDuplicateRoom={handleDuplicateRoom}
            onRenameRoom={handleRenameRoom}
            onInteractionEnd={pushToHistory}
            onUndo={handleUndo}
            onRedo={handleRedo}
            canUndo={canUndo}
            canRedo={canRedo}
        />
      </main>
    </div>
  );
};

export default App;