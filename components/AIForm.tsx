import React, { useState } from 'react';
import { GoogleGenAI, Type } from "@google/genai";

interface AIFormProps {
  onAddRooms: (rooms: { name: string; area: number }[]) => void;
}

export const AIForm: React.FC<AIFormProps> = ({ onAddRooms }) => {
  const [prompt, setPrompt] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim()) {
      alert("Proszę wpisać opis planu piętra.");
      return;
    }
    setIsLoading(true);

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      
      const responseSchema = {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            name: {
              type: Type.STRING,
              description: 'Nazwa pomieszczenia, np. "Salon", "Sypialnia 1".',
            },
            area: {
              type: Type.NUMBER,
              description: 'Sugerowana powierzchnia pomieszczenia w metrach kwadratowych.',
            },
          },
          required: ['name', 'area'],
        },
      };

      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: `Przeanalizuj poniższy opis planu piętra i wygeneruj listę pomieszczeń wraz z ich sugerowaną, realistyczną powierzchnią w m². Opis: "${prompt}"`,
        config: {
          responseMimeType: "application/json",
          responseSchema: responseSchema,
           systemInstruction: "Jesteś asystentem architekta specjalizującym się w projektowaniu funkcjonalnych planów pięter. Twoim zadaniem jest przekształcanie opisów tekstowych w ustrukturyzowaną listę pomieszczeń z rozsądnie oszacowaną powierzchnią.",
        },
      });
      
      const generatedRooms = JSON.parse(response.text);
      
      if (Array.isArray(generatedRooms) && generatedRooms.length > 0) {
        onAddRooms(generatedRooms.map(r => ({name: r.name, area: r.area})));
        setPrompt('');
      } else {
         alert("Nie udało się wygenerować pomieszczeń na podstawie podanego opisu. Spróbuj go doprecyzować.");
      }

    } catch (error) {
      console.error("Błąd podczas komunikacji z API Gemini:", error);
      alert("Wystąpił błąd podczas generowania planu. Spróbuj ponownie później.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
       <div>
        <label htmlFor="aiPrompt" className="block text-sm font-medium text-slate-700 mb-1">
          Generator AI
        </label>
        <textarea
          id="aiPrompt"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          className="mt-1 block w-full px-3 py-2 bg-white border border-slate-300 rounded-md placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 sm:text-sm"
          placeholder="np. dom z 2 sypialniami, salonem i kuchnią"
          rows={3}
          disabled={isLoading}
        />
      </div>
      <button
        type="submit"
        disabled={isLoading}
        className="w-full bg-indigo-500 hover:bg-indigo-600 text-white font-bold py-2 px-4 rounded-lg shadow-md hover:shadow-lg transition-all flex items-center justify-center disabled:bg-indigo-300 disabled:cursor-not-allowed"
      >
        {isLoading ? (
          <>
            <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            Generowanie...
          </>
        ) : (
          <>
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-2"><path d="M12 3c.3 0 .5.1.8.4l2.5 2.5c.2.3.4.5.4.8v0c0 .3-.1.5-.4.8l-2.5 2.5c-.3.2-.5.4-.8.4s-.5-.1-.8-.4l-2.5-2.5c-.2-.3-.4-.5-.4-.8v0c0-.3.1-.5.4-.8l2.5-2.5c.3-.3.5-.4.8-.4zM3.5 13.5c.3 0 .5.1.8.4l2.5 2.5c.2.3.4.5.4.8v0c0 .3-.1.5-.4.8l-2.5 2.5c-.3.2-.5.4-.8.4s-.5-.1-.8-.4l-2.5-2.5c-.2-.3-.4-.5-.4-.8v0c0-.3.1-.5.4-.8l2.5-2.5c.3-.3.5-.4.8-.4z"/><path d="M21 12c.3 0 .5-.1.8-.4l-2.5-2.5c-.3-.2-.5-.4-.8-.4s-.5.1-.8.4l-2.5 2.5c-.2.3-.4.5-.4.8v0c0 .3.1.5.4.8l2.5 2.5c.3.2.5.4.8.4s.5-.1.8-.4l2.5-2.5c.2-.3.4-.5.4-.8v0c0-.3-.1-.5-.4-.8z"/></svg>
            Generuj z AI
          </>
        )}
      </button>
    </form>
  );
};
