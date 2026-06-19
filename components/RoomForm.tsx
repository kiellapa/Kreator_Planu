import React, { useState } from 'react';

interface RoomFormProps {
  onAddRoom: (name: string, area: number) => void;
}

export const RoomForm: React.FC<RoomFormProps> = ({ onAddRoom }) => {
  const [name, setName] = useState('');
  const [area, setArea] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const areaValue = parseFloat(area);
    if (name.trim() && !isNaN(areaValue) && areaValue > 0) {
      onAddRoom(name, areaValue);
      setName('');
      setArea('');
    } else {
      alert("Proszę podać poprawną nazwę i powierzchnię (większą od 0).");
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label htmlFor="roomName" className="block text-sm font-medium text-slate-700 mb-1">
          Nazwa pomieszczenia
        </label>
        <input
          type="text"
          id="roomName"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="mt-1 block w-full px-3 py-2 bg-white border border-slate-300 rounded-md placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500 sm:text-sm"
          placeholder="np. Salon"
        />
      </div>
      <div>
        <label htmlFor="roomArea" className="block text-sm font-medium text-slate-700 mb-1">
          Powierzchnia (m²)
        </label>
        <input
          type="number"
          id="roomArea"
          value={area}
          onChange={(e) => setArea(e.target.value)}
          className="mt-1 block w-full px-3 py-2 bg-white border border-slate-300 rounded-md placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500 sm:text-sm"
          placeholder="np. 25"
          min="0.1"
          step="0.1"
        />
      </div>
      <button
        type="submit"
        className="w-full bg-amber-400 hover:bg-amber-500 text-white font-bold py-2 px-4 rounded-lg shadow-md hover:shadow-lg transition-all"
      >
        Dodaj pomieszczenie
      </button>
    </form>
  );
};