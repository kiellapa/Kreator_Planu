import React, { useState, useRef, useEffect, useCallback } from 'react';
import type { Room, Rectangle } from '../types';
import { getBoundarySegments, orderSegmentsIntoPolygons } from '../utils/geometry';


interface FloorPlanCanvasProps {
  rooms: Room[];
  onRoomsUpdate: React.Dispatch<React.SetStateAction<Room[]>>;
  pixelsPerMeter: number;
  onDeleteRoom: (roomId: string) => void;
  onDuplicateRoom: (roomId: string) => void;
  onRenameRoom: (roomId: string, newName: string) => void;
  onInteractionEnd: (initialState: Room[]) => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
}

type Corner = 'nw' | 'ne' | 'sw' | 'se';
type Edge = 'top' | 'bottom' | 'left' | 'right';

type ActionState = {
  type: 'move';
  roomId: string;
  partId: string;
  offsetX: number;
  offsetY: number;
} | {
  type: 'resize';
  roomId: string;
  partId: string;
  corner: Corner;
} | {
  type: 'resize-edge';
  roomId: string;
  partId: string;
  edge: Edge;
};

type ContextMenuState = {
  x: number;
  y: number;
  roomId: string;
};

type Point = { x: number; y: number; };
export type Segment = { x1: number; y1: number; x2: number; y2: number };


const SNAP_THRESHOLD = 5;
const MIN_RECT_SIZE = 10; // Minimum size in pixels for width/height

const PRESET_COLORS = [
  { name: 'Niebieski', value: 'fill-sky-300' },
  { name: 'Zielony', value: 'fill-emerald-300' },
  { name: 'Żółty', value: 'fill-amber-300' },
  { name: 'Różowy', value: 'fill-fuchsia-300' },
  { name: 'Fioletowy', value: 'fill-violet-400' },
  { name: 'Morski', value: 'fill-cyan-300' },
  { name: 'Atrament', value: 'fill-indigo-300' },
  { name: 'Teal', value: 'fill-teal-300' },
  { name: 'Czerwony', value: 'fill-rose-300' },
  { name: 'Szarobłękitny', value: 'fill-slate-300' },
];

const estimateTextWidth = (text: string, fontSize: number): number => {
  let width = 0;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (/[A-ZĄĆĘŁŃÓŚŹŻ]/.test(char)) width += 0.65;
    else if (/[mw]/.test(char)) width += 0.7;
    else if (/[ijl]/i.test(char)) width += 0.25;
    else if (/[f-s]/.test(char)) width += 0.45;
    else width += 0.52;
  }
  return width * fontSize;
};

const getFittingRoomName = (name: string, fontS: number, availW: number): string => {
  if (name.length === 0) return '';
  const fullWidth = estimateTextWidth(name, fontS);
  if (fullWidth <= availW) {
    return name;
  }
  
  for (let len = name.length - 1; len >= 1; len--) {
    const candidate = name.substring(0, len) + '.';
    if (estimateTextWidth(candidate, fontS) <= availW) {
      return candidate;
    }
  }
  
  const firstLetter = name.charAt(0);
  if (estimateTextWidth(firstLetter, fontS) <= availW) {
    return firstLetter;
  }
  
  return '';
};

const getFittingAreaLabel = (current: number, target: number, fontS: number, availW: number): string => {
  const fullLabel = `${current.toFixed(1)} / ${target.toFixed(1)} m²`;
  if (estimateTextWidth(fullLabel, fontS) <= availW) {
    return fullLabel;
  }
  
  const mediumLabel = `${current.toFixed(1)} m²`;
  if (estimateTextWidth(mediumLabel, fontS) <= availW) {
    return mediumLabel;
  }

  const shortLabel = `${Math.round(current)} m²`;
  if (estimateTextWidth(shortLabel, fontS) <= availW) {
    return shortLabel;
  }
  
  const minimalLabel = `${Math.round(current)}`;
  if (estimateTextWidth(minimalLabel, fontS) <= availW) {
    return minimalLabel;
  }

  return '';
};

const cutRectangle = (rectToCut: Rectangle, cutterRect: Rectangle): Rectangle[] => {
  const ix1 = Math.max(rectToCut.x, cutterRect.x);
  const iy1 = Math.max(rectToCut.y, cutterRect.y);
  const ix2 = Math.min(rectToCut.x + rectToCut.width, cutterRect.x + cutterRect.width);
  const iy2 = Math.min(rectToCut.y + rectToCut.height, cutterRect.y + cutterRect.height);

  if (ix1 >= ix2 || iy1 >= iy2) {
    return [rectToCut];
  }

  const result: Rectangle[] = [];
  if (rectToCut.y < iy1) result.push({ ...rectToCut, height: iy1 - rectToCut.y });
  if (rectToCut.y + rectToCut.height > iy2) result.push({ ...rectToCut, y: iy2, height: rectToCut.y + rectToCut.height - iy2 });
  if (rectToCut.x < ix1) result.push({ ...rectToCut, y: iy1, height: iy2 - iy1, width: ix1 - rectToCut.x });
  if (rectToCut.x + rectToCut.width > ix2) result.push({ ...rectToCut, x: ix2, y: iy1, height: iy2 - iy1, width: rectToCut.x + rectToCut.width - ix2 });

  return result.filter(r => r.width > 0.01 && r.height > 0.01).map((r, i) => ({...r, id: `${rectToCut.id}_sub_${Date.now()}_${i}`}));
};

const generatePathForRoom = (polygons: Point[][]): string => {
  let path = '';
  for (const polygon of polygons) {
    if (polygon.length === 0) continue;
    const start = polygon[0];
    path += `M ${start.x} ${start.y} `;
    for (let i = 1; i < polygon.length; i++) {
      path += `L ${polygon[i].x} ${polygon[i].y} `;
    }
    path += 'Z ';
  }
  return path.trim();
};

export const FloorPlanCanvas: React.FC<FloorPlanCanvasProps> = ({ 
    rooms, onRoomsUpdate, pixelsPerMeter, 
    onDeleteRoom, onDuplicateRoom, onRenameRoom,
    onInteractionEnd, onUndo, onRedo, canUndo, canRedo
}) => {
  const [actionState, setActionState] = useState<ActionState | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [renamingRoomId, setRenamingRoomId] = useState<string | null>(null);
  const [viewBox, setViewBox] = useState({ x: 0, y: 0, width: 1, height: 1 });
  const [svgDimensions, setSvgDimensions] = useState({ width: 0, height: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const panStartRef = useRef({ x: 0, y: 0 });
  const svgRef = useRef<SVGSVGElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const canvasContainerRef = useRef<HTMLDivElement>(null);
  const [showDimensions, setShowDimensions] = useState(true);
  const preInteractionStateRef = useRef<Room[] | null>(null);

  useEffect(() => {
    const svgElement = svgRef.current;
    if (!svgElement) return;

    const observer = new ResizeObserver((entries) => {
        const { width, height } = entries[0].contentRect;
        if (width > 0 && height > 0) {
            if (svgDimensions.width === 0) { // Set initial on first valid observation
                setViewBox({ x: 0, y: 0, width, height });
            }
            setSvgDimensions({ width, height });
        }
    });
    observer.observe(svgElement);
    return () => observer.disconnect();
  }, [svgDimensions.width]);
  
  const getSVGCoordinates = useCallback((e: React.MouseEvent | MouseEvent | React.TouchEvent | TouchEvent | React.WheelEvent): { x: number; y: number } => {
    if (!svgRef.current) return { x: 0, y: 0 };

    const point = 'touches' in e ? e.touches[0] : e;
    if (!point) return { x: 0, y: 0 };

    const svgPoint = svgRef.current.createSVGPoint();
    svgPoint.x = point.clientX;
    svgPoint.y = point.clientY;
    const CTM = svgRef.current.getScreenCTM();
    if (CTM) return svgPoint.matrixTransform(CTM.inverse());
    return { x: 0, y: 0 };
  }, []);
  
  const startInteraction = () => {
    if (!preInteractionStateRef.current) {
        preInteractionStateRef.current = rooms;
    }
  };

  const handleMoveStart = (e: React.MouseEvent | React.TouchEvent, roomId: string, part: Rectangle) => {
    e.stopPropagation();
    setContextMenu(null);
    if (renamingRoomId) setRenamingRoomId(null);
    startInteraction();
    const { x, y } = getSVGCoordinates(e);
    setActionState({
      type: 'move',
      roomId,
      partId: part.id,
      offsetX: x - part.x,
      offsetY: y - part.y,
    });
  };

  const handleResizeStart = (e: React.MouseEvent | React.TouchEvent, roomId: string, partId: string, corner: Corner) => {
    e.stopPropagation();
    setContextMenu(null);
    if (renamingRoomId) setRenamingRoomId(null);
    startInteraction();
    setActionState({
      type: 'resize',
      roomId,
      partId,
      corner,
    });
  };
  
  const handleEdgeResizeStart = (e: React.MouseEvent | React.TouchEvent, roomId: string, segment: Segment) => {
    e.stopPropagation();
    setContextMenu(null);
    if (renamingRoomId) setRenamingRoomId(null);
    startInteraction();
    const { x: mouseX, y: mouseY } = getSVGCoordinates(e);

    const room = rooms.find(r => r.id === roomId);
    if (!room) return;

    let targetPart: Rectangle | undefined;
    let targetEdge: Edge | undefined;
    const isHorizontal = segment.y1 === segment.y2;

    for (const part of room.parts) {
      if (isHorizontal) {
        if (Math.abs(part.y - segment.y1) < 1 && mouseX >= part.x && mouseX <= part.x + part.width) {
          targetPart = part; targetEdge = 'top'; break;
        }
        if (Math.abs((part.y + part.height) - segment.y1) < 1 && mouseX >= part.x && mouseX <= part.x + part.width) {
          targetPart = part; targetEdge = 'bottom'; break;
        }
      } else { // Vertical
        if (Math.abs(part.x - segment.x1) < 1 && mouseY >= part.y && mouseY <= part.y + part.height) {
          targetPart = part; targetEdge = 'left'; break;
        }
        if (Math.abs((part.x + part.width) - segment.x1) < 1 && mouseY >= part.y && mouseY <= part.y + part.height) {
          targetPart = part; targetEdge = 'right'; break;
        }
      }
    }

    if (targetPart && targetEdge) {
      setActionState({
        type: 'resize-edge',
        roomId,
        partId: targetPart.id,
        edge: targetEdge,
      });
    }
  };

  const handleDragMove = useCallback((e: MouseEvent | TouchEvent) => {
    if (!actionState) return;

    if (e.cancelable) {
      e.preventDefault();
    }

    const { x: mouseX, y: mouseY } = getSVGCoordinates(e);
    
    if(actionState.type === 'move') {
      let newPartX = mouseX - actionState.offsetX;
      let newPartY = mouseY - actionState.offsetY;

      const draggedRoom = rooms.find(r => r.id === actionState.roomId);
      if (!draggedRoom) return;
      const draggedPart = draggedRoom.parts.find(p => p.id === actionState.partId);
      if(!draggedPart) return;

      // Snapping logic
      let snappedX = false;
      let snappedY = false;

      for (const room of rooms) {
        if (room.id === actionState.roomId) continue;
        for (const part of room.parts) {
          if(!snappedY) {
              if (Math.abs(newPartY - (part.y + part.height)) < SNAP_THRESHOLD) { newPartY = part.y + part.height; snappedY = true; }
              if (Math.abs((newPartY + draggedPart.height) - part.y) < SNAP_THRESHOLD) { newPartY = part.y - draggedPart.height; snappedY = true; }
              if (Math.abs(newPartY - part.y) < SNAP_THRESHOLD) { newPartY = part.y; snappedY = true; }
          }
          if(!snappedX) {
              if (Math.abs(newPartX - (part.x + part.width)) < SNAP_THRESHOLD) { newPartX = part.x + part.width; snappedX = true; }
              if (Math.abs((newPartX + draggedPart.width) - part.x) < SNAP_THRESHOLD) { newPartX = part.x - draggedPart.width; snappedX = true; }
              if (Math.abs(newPartX - part.x) < SNAP_THRESHOLD) { newPartX = part.x; snappedX = true; }
          }
          if(snappedX && snappedY) break;
        }
        if(snappedX && snappedY) break;
      }
      
      const deltaX = newPartX - draggedPart.x;
      const deltaY = newPartY - draggedPart.y;

      onRoomsUpdate(rooms.map(room => 
        room.id === actionState.roomId 
          ? { ...room, parts: room.parts.map(p => ({ ...p, x: p.x + deltaX, y: p.y + deltaY })) } 
          : room
      ));

    } else if (actionState.type === 'resize' || actionState.type === 'resize-edge') {
        const { roomId, partId } = actionState;
        
        const otherParts = rooms.filter(r => r.id !== roomId).flatMap(r => r.parts);
        const verticalEdges = otherParts.flatMap(p => [p.x, p.x + p.width]);
        const horizontalEdges = otherParts.flatMap(p => [p.y, p.y + p.height]);
        
        let newMouseX = mouseX;
        let newMouseY = mouseY;
        
        for (const edge of verticalEdges) if (Math.abs(mouseX - edge) < SNAP_THRESHOLD) { newMouseX = edge; break; }
        for (const edge of horizontalEdges) if (Math.abs(mouseY - edge) < SNAP_THRESHOLD) { newMouseY = edge; break; }

        onRoomsUpdate(rooms.map(room => {
            if (room.id !== roomId) return room;
            return {
                ...room,
                parts: room.parts.map(part => {
                    if (part.id !== partId) return part;
                    
                    let { x, y, width, height } = part;
                    const right = x + width;
                    const bottom = y + height;
                    
                    const corner = actionState.type === 'resize' ? actionState.corner : undefined;
                    const edge = actionState.type === 'resize-edge' ? actionState.edge : undefined;

                    if (corner === 'nw' || edge === 'top' || edge === 'left') {
                        if (corner === 'nw' || edge === 'top') {
                            height = Math.max(MIN_RECT_SIZE, bottom - newMouseY);
                            y = bottom - height;
                        }
                        if (corner === 'nw' || edge === 'left') {
                            width = Math.max(MIN_RECT_SIZE, right - newMouseX);
                            x = right - width;
                        }
                    }
                    if (corner === 'ne' || edge === 'top' || edge === 'right') {
                         if (corner === 'ne' || edge === 'top') {
                            height = Math.max(MIN_RECT_SIZE, bottom - newMouseY);
                            y = bottom - height;
                        }
                         if (corner === 'ne' || edge === 'right') {
                            width = Math.max(MIN_RECT_SIZE, newMouseX - x);
                        }
                    }
                    if (corner === 'sw' || edge === 'bottom' || edge === 'left') {
                        if (corner === 'sw' || edge === 'bottom') {
                            height = Math.max(MIN_RECT_SIZE, newMouseY - y);
                        }
                        if (corner === 'sw' || edge === 'left') {
                            width = Math.max(MIN_RECT_SIZE, right - newMouseX);
                            x = right - width;
                        }
                    }
                    if (corner === 'se' || edge === 'bottom' || edge === 'right') {
                         if (corner === 'se' || edge === 'bottom') {
                            height = Math.max(MIN_RECT_SIZE, newMouseY - y);
                        }
                         if (corner === 'se' || edge === 'right') {
                            width = Math.max(MIN_RECT_SIZE, newMouseX - x);
                        }
                    }
                    
                    return { ...part, x, y, width, height };
                })
            };
        }));
    }
  }, [actionState, rooms, onRoomsUpdate, getSVGCoordinates]);

  const handleDragEnd = useCallback(() => {
    if (!actionState) return;
    
    if (preInteractionStateRef.current) {
        onInteractionEnd(preInteractionStateRef.current);
        preInteractionStateRef.current = null;
    }

    const subjectRoom = rooms.find(r => r.id === actionState.roomId);
    if (!subjectRoom) {
        setActionState(null);
        return;
    }

    const cutters = subjectRoom.parts;

    const finalRooms = rooms.map(room => {
      if (room.id === actionState.roomId) {
        return room;
      }

      let resultingParts = room.parts;
      for (const cutter of cutters) {
        resultingParts = resultingParts.flatMap(part => cutRectangle(part, cutter));
      }

      return { ...room, parts: resultingParts };
    });
    
    onRoomsUpdate(finalRooms);
    setActionState(null);
  }, [actionState, rooms, onRoomsUpdate, onInteractionEnd]);

  const handleContextMenu = (e: React.MouseEvent, roomId: string) => {
    e.preventDefault();
    if(renamingRoomId) return;
    const room = rooms.find(r => r.id === roomId);
    if (room) {
      const parentRect = (e.currentTarget as SVGElement).closest('div[data-container="canvas"]')?.getBoundingClientRect();
      if(parentRect) {
        setContextMenu({
          x: e.clientX - parentRect.left,
          y: e.clientY - parentRect.top,
          roomId: roomId,
        });
      }
    }
  };

  const handleRestoreShape = (roomId: string) => {
    onRoomsUpdate(prevRooms => {
        const roomToRestore = prevRooms.find(r => r.id === roomId);
        if (!roomToRestore) return prevRooms;
        
        onInteractionEnd(prevRooms);

        let totalArea = 0;
        let minX = Infinity;
        let minY = Infinity;

        roomToRestore.parts.forEach(part => {
          totalArea += part.width * part.height;
          minX = Math.min(minX, part.x);
          minY = Math.min(minY, part.y);
        });

        const side = Math.sqrt(totalArea);

        const newPart: Rectangle = {
          id: `${roomToRestore.id}_part_restored_${Date.now()}`,
          x: minX,
          y: minY,
          width: side,
          height: side,
        };

        return prevRooms.map(room =>
          room.id === roomId
            ? { ...room, parts: [newPart] }
            : room
        );
    });
    setContextMenu(null);
  };
  
  const handleSimplifyShape = (roomId: string) => {
    onRoomsUpdate(prevRooms => {
        const roomToSimplify = prevRooms.find(r => r.id === roomId);
        if (!roomToSimplify || roomToSimplify.parts.length <= 1) return prevRooms;
        
        onInteractionEnd(prevRooms);

        let minX = Infinity;
        let minY = Infinity;
        let maxX = -Infinity;
        let maxY = -Infinity;

        roomToSimplify.parts.forEach(part => {
            minX = Math.min(minX, part.x);
            minY = Math.min(minY, part.y);
            maxX = Math.max(maxX, part.x + part.width);
            maxY = Math.max(maxY, part.y + part.height);
        });

        const simplifiedBoundingBox: Rectangle = {
          id: `${roomToSimplify.id}_part_simplified_${Date.now()}`,
          x: minX,
          y: minY,
          width: maxX - minX,
          height: maxY - minY,
        };

        let finalSimplifiedParts: Rectangle[] = [simplifiedBoundingBox];
        const otherRooms = prevRooms.filter(r => r.id !== roomId);

        for (const otherRoom of otherRooms) {
            for (const cutterPart of otherRoom.parts) {
                finalSimplifiedParts = finalSimplifiedParts.flatMap(partToCut => 
                    cutRectangle(partToCut, cutterPart)
                );
            }
        }

        return prevRooms.map(room =>
          room.id === roomId
            ? { ...room, parts: finalSimplifiedParts }
            : room
        );
    });
    setContextMenu(null);
  };

  const handleStartRename = (roomId: string) => {
    setRenamingRoomId(roomId);
    setContextMenu(null);
  };

  const handleFinishRename = (roomId: string, newName: string) => {
    if (newName.trim()) {
      onRenameRoom(roomId, newName.trim());
    }
    setRenamingRoomId(null);
  };

  const handleDuplicate = (roomId: string) => {
    onDuplicateRoom(roomId);
    setContextMenu(null);
  };

  const handleDelete = (roomId: string) => {
    onDeleteRoom(roomId);
    setContextMenu(null);
  };

  const handleChangeColor = (roomId: string, newColor: string) => {
    onInteractionEnd(rooms);
    onRoomsUpdate(prevRooms => prevRooms.map(room =>
      room.id === roomId
        ? { ...room, color: newColor }
        : room
    ));
    setContextMenu(null);
  };
  
  const handleWheel = useCallback((e: React.WheelEvent) => {
      e.preventDefault();
      const zoomIntensity = 0.1;
      const scale = e.deltaY > 0 ? 1 + zoomIntensity : 1 - zoomIntensity;

      const mousePoint = getSVGCoordinates(e);

      const newWidth = viewBox.width * scale;
      const newHeight = viewBox.height * scale;
      const newX = viewBox.x + (mousePoint.x - viewBox.x) * (1 - scale);
      const newY = viewBox.y + (mousePoint.y - viewBox.y) * (1 - scale);

      setViewBox({ x: newX, y: newY, width: newWidth, height: newHeight });

    }, [viewBox, getSVGCoordinates]);

  const handlePanStart = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    const isMouseEvent = 'button' in e;
    const isTouchEvent = 'touches' in e;

    if (isMouseEvent && e.button !== 0 && e.button !== 1) return;
    if (isTouchEvent && e.touches.length !== 1) return;

    e.preventDefault();
    setIsPanning(true);

    const point = isTouchEvent ? e.touches[0] : e;
    panStartRef.current = { x: point.clientX, y: point.clientY };
  }, []);

  const handlePanMove = useCallback((e: MouseEvent | TouchEvent) => {
    if (!isPanning || !svgRef.current) return;
    
    const point = 'touches' in e ? e.touches[0] : e;
    if (!point) return;

    const dx = point.clientX - panStartRef.current.x;
    const dy = point.clientY - panStartRef.current.y;
    
    const svgWidth = svgRef.current.clientWidth;
    const svgHeight = svgRef.current.clientHeight;

    if (svgWidth === 0 || svgHeight === 0) return;

    const scaleX = viewBox.width / svgWidth;
    const scaleY = viewBox.height / svgHeight;

    setViewBox(prev => ({
      ...prev,
      x: prev.x - dx * scaleX,
      y: prev.y - dy * scaleY,
    }));

    panStartRef.current = { x: point.clientX, y: point.clientY };
  }, [isPanning, viewBox.width, viewBox.height]);

  const handlePanEnd = useCallback(() => {
    setIsPanning(false);
  }, []);
  
  const handleZoomButtonClick = (isZoomIn: boolean) => {
      const scale = isZoomIn ? 1 / 1.2 : 1.2;
      const newWidth = viewBox.width * scale;
      const newHeight = viewBox.height * scale;
      
      const centerX = viewBox.x + viewBox.width / 2;
      const centerY = viewBox.y + viewBox.height / 2;

      const newX = centerX - newWidth / 2;
      const newY = centerY - newHeight / 2;

      setViewBox({ x: newX, y: newY, width: newWidth, height: newHeight });
  };
    
  const toggleFullscreen = useCallback(() => {
    if (!canvasContainerRef.current) return;

    if (!document.fullscreenElement) {
        canvasContainerRef.current.requestFullscreen().catch(err => {
            alert(`Błąd przy próbie włączenia trybu pełnoekranowego: ${err.message} (${err.name})`);
        });
    } else {
        if (document.exitFullscreen) {
            document.exitFullscreen();
        }
    }
  }, []);
  
  const toggleDimensions = () => {
      setShowDimensions(prev => !prev);
  };

  useEffect(() => {
    const handleFullscreenChange = () => {
        setIsFullscreen(!!document.fullscreenElement);
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);

    return () => {
        document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, []);

  useEffect(() => {
    const options = { passive: false };
    const handleGlobalMouseMove = (e: MouseEvent) => {
      handleDragMove(e);
      handlePanMove(e);
    };
    const handleGlobalTouchMove = (e: TouchEvent) => {
      handleDragMove(e);
      handlePanMove(e);
    };

    const handleGlobalMouseUp = () => {
      handleDragEnd();
      handlePanEnd();
    };
    
    const handleGlobalTouchEnd = () => {
      handleDragEnd();
      handlePanEnd();
    }

    window.addEventListener('mousemove', handleGlobalMouseMove);
    window.addEventListener('touchmove', handleGlobalTouchMove, options);
    window.addEventListener('mouseup', handleGlobalMouseUp);
    window.addEventListener('touchend', handleGlobalTouchEnd);
    window.addEventListener('touchcancel', handleGlobalTouchEnd);

    return () => {
      window.removeEventListener('mousemove', handleGlobalMouseMove);
      window.removeEventListener('touchmove', handleGlobalTouchMove, false);
      window.removeEventListener('mouseup', handleGlobalMouseUp);
      window.removeEventListener('touchend', handleGlobalTouchEnd);
      window.removeEventListener('touchcancel', handleGlobalTouchEnd);
    };
  }, [handleDragMove, handleDragEnd, handlePanMove, handlePanEnd]);
  
  const cornerCursors: Record<Corner, string> = {
    nw: 'cursor-nwse-resize',
    ne: 'cursor-nesw-resize',
    sw: 'cursor-nesw-resize',
    se: 'cursor-nwse-resize',
  };

  const totalAreaPixels = rooms.reduce((total, room) => {
    const roomArea = room.parts.reduce((roomTotal, part) => {
      return roomTotal + part.width * part.height;
    }, 0);
    return total + roomArea;
  }, 0);

  const totalAreaM2 = totalAreaPixels / (pixelsPerMeter * pixelsPerMeter);

  const zoomScale = svgDimensions.width > 0 ? viewBox.width / svgDimensions.width : 1;

  return (
    <div 
      ref={canvasContainerRef}
      className="w-full h-full relative bg-white rounded-xl shadow-lg" 
      data-container="canvas"
      onClick={() => { 
        if (contextMenu) setContextMenu(null);
        if (renamingRoomId) setRenamingRoomId(null);
      }}
    >
      <div className="absolute top-4 left-4 bg-white p-2 px-4 rounded-lg shadow-md text-sm text-slate-800 font-medium z-10">
        Całkowita powierzchnia: {totalAreaM2.toFixed(2)} m²
      </div>
      <svg 
        ref={svgRef} 
        className="w-full h-full"
        viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`}
        onWheel={handleWheel}
        onMouseDown={handlePanStart}
        onTouchStart={handlePanStart}
      >
        <defs>
           <filter id="drop-shadow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="3" dy="3" stdDeviation="3" floodColor="#000000" floodOpacity="0.15" />
          </filter>
           <filter id="paper-texture-filter" x="0" y="0" width="100%" height="100%">
            <feTurbulence type="fractalNoise" baseFrequency="0.05" numOctaves="3" stitchTiles="stitch" />
            <feColorMatrix type="matrix" values="0 0 0 0 0.15 0 0 0 0 0.15 0 0 0 0 0.15 0 0 0 0.1 0" />
          </filter>
          <pattern id="paper-pattern" patternUnits="userSpaceOnUse" width="200" height="200">
            <rect width="200" height="200" fill="#f8fafc"></rect>
            <rect width="200" height="200" filter="url(#paper-texture-filter)" opacity="0.6"></rect>
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#paper-pattern)" x={viewBox.x} y={viewBox.y} />
        
        {rooms.map(room => {
          if (room.parts.length === 0) return null;
          
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
          
          const currentAreaM2 = totalArea / (pixelsPerMeter * pixelsPerMeter);
          const boundarySegments = getBoundarySegments(room.parts);
          const polygons = orderSegmentsIntoPolygons(boundarySegments);
          const pathData = generatePathForRoom(polygons);
          const centerX = largestPart.x + largestPart.width / 2;
          const centerY = largestPart.y + largestPart.height / 2;

          const fontS = 17.6 * zoomScale;
          const areaFontS = 14 * zoomScale;

          const availW = Math.max(0, largestPart.width - 8);
          const availH = largestPart.height;

          const showArea = availH >= (fontS + areaFontS + 6);
          const showName = availH >= (fontS + 4);

          const fittingName = showName ? getFittingRoomName(room.name, fontS, availW) : '';
          const fittingArea = (showArea && fittingName !== '') ? getFittingAreaLabel(currentAreaM2, room.targetArea, areaFontS, availW) : '';

          const hasAreaText = fittingArea !== '';
          const nameYPosition = hasAreaText ? centerY - 5 * zoomScale : centerY;

          return (
            <g key={room.id} onContextMenu={(e) => handleContextMenu(e, room.id)} filter="url(#drop-shadow)">
              <path
                d={pathData}
                fill={room.color.startsWith('#') ? room.color : undefined}
                className={room.color.startsWith('#') ? 'stroke-slate-600 stroke-1' : `${room.color}`}
              />

              {showDimensions && (
                <g className="dimensions">
                  {boundarySegments.map((segment, i) => {
                    const midX = (segment.x1 + segment.x2) / 2;
                    const midY = (segment.y1 + segment.y2) / 2;
                    const lengthInPixels = Math.hypot(segment.x2 - segment.x1, segment.y2 - segment.y1);

                    if (lengthInPixels < 50 * zoomScale) return null;

                    const lengthInMeters = lengthInPixels / pixelsPerMeter;
                    const dimensionText = `${lengthInMeters.toFixed(2)} m`;

                    let textX = midX;
                    let textY = midY;
                    let rotation = 0;
                    const offset = 12 * zoomScale;
                    const epsilon = 1;

                    const isHorizontal = Math.abs(segment.y1 - segment.y2) < 0.1;

                    if (isHorizontal) {
                      const testPointUp = { x: midX, y: midY - epsilon };
                      const isUpInside = room.parts.some(p => testPointUp.x >= p.x && testPointUp.x < p.x + p.width && testPointUp.y >= p.y && testPointUp.y < p.y + p.height);
                      textY = isUpInside ? midY - offset : midY + offset;
                    } else { // Vertical
                      rotation = -90;
                      const testPointLeft = { x: midX - epsilon, y: midY };
                      const isLeftInside = room.parts.some(p => testPointLeft.x >= p.x && testPointLeft.x < p.x + p.width && testPointLeft.y >= p.y && testPointLeft.y < p.y + p.height);
                      textX = isLeftInside ? midX - offset : midX + offset;
                    }
                    
                    return (
                      <text
                        key={`dim-${room.id}-${i}`}
                        x={textX}
                        y={textY}
                        transform={`rotate(${rotation} ${textX} ${textY})`}
                        fontSize={12 * zoomScale}
                        fill="#475569"
                        textAnchor="middle"
                        dominantBaseline="middle"
                        className="pointer-events-none select-none font-mono"
                      >
                        {dimensionText}
                      </text>
                    );
                  })}
                </g>
              )}
              
              {boundarySegments.map((segment, i) => (
                  <line
                    key={i}
                    x1={segment.x1}
                    y1={segment.y1}
                    x2={segment.x2}
                    y2={segment.y2}
                    className={segment.y1 === segment.y2 ? 'cursor-ns-resize' : 'cursor-ew-resize'}
                    stroke="transparent"
                    strokeWidth="8"
                    onMouseDown={(e) => handleEdgeResizeStart(e, room.id, segment)}
                    onTouchStart={(e) => handleEdgeResizeStart(e, room.id, segment)}
                  />
              ))}

              {room.parts.map(part => (
                <g key={part.id}>
                  {(['nw', 'ne', 'sw', 'se'] as Corner[]).map(corner => (
                    <circle
                      key={corner}
                      cx={part.x + (corner.includes('e') ? part.width : 0)}
                      cy={part.y + (corner.includes('s') ? part.height : 0)}
                      r={5 * zoomScale}
                      strokeWidth={2 * zoomScale}
                      className={`fill-slate-700 stroke-white ${cornerCursors[corner]}`}
                      onMouseDown={(e) => handleResizeStart(e, room.id, part.id, corner)}
                      onTouchStart={(e) => handleResizeStart(e, room.id, part.id, corner)}
                    />
                  ))}
                </g>
              ))}
              
              {renamingRoomId === room.id ? (
                <foreignObject
                  x={largestPart.x}
                  y={largestPart.y + largestPart.height / 2 - 20}
                  width={largestPart.width}
                  height={40}
                  onClick={(e) => e.stopPropagation()}
                  onMouseDown={(e) => e.stopPropagation()}
                >
                  <div className="w-full h-full flex items-center justify-center">
                    <input
                      type="text"
                      defaultValue={room.name}
                      autoFocus
                      onFocus={(e) => e.target.select()}
                      onBlur={(e) => handleFinishRename(room.id, e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') e.currentTarget.blur();
                        if (e.key === 'Escape') setRenamingRoomId(null);
                      }}
                      className="w-4/5 max-w-[200px] text-center bg-white/90 border border-slate-300 rounded-md text-base font-medium p-1 outline-none focus:ring-2 ring-sky-500"
                    />
                  </div>
                </foreignObject>
              ) : (
                <>
                  <g className="pointer-events-none select-none">
                    {fittingName && (
                      <text
                        x={centerX}
                        y={nameYPosition}
                        dy=".3em"
                        textAnchor="middle"
                        className="fill-slate-900 font-bold"
                        fontSize={fontS}
                      >
                        {fittingName}
                      </text>
                    )}
                    {fittingArea && (
                      <text
                        x={centerX}
                        y={centerY + 12 * zoomScale}
                        dy=".3em"
                        textAnchor="middle"
                        className="fill-slate-600"
                        fontSize={areaFontS}
                      >
                        {fittingArea}
                      </text>
                    )}
                  </g>
                   <g
                    className="cursor-move"
                    onMouseDown={(e) => handleMoveStart(e, room.id, largestPart)}
                    onTouchStart={(e) => handleMoveStart(e, room.id, largestPart)}
                  >
                    <rect 
                        x={largestPart.x} 
                        y={largestPart.y} 
                        width={largestPart.width} 
                        height={largestPart.height} 
                        fill="transparent" 
                    />
                  </g>
                </>
              )}
            </g>
          );
        })}
      </svg>
      {contextMenu && (
        <div
          style={{ top: `${contextMenu.y}px`, left: `${contextMenu.x}px` }}
          className="absolute bg-white rounded-md shadow-lg py-1 z-20"
          onClick={e => e.stopPropagation()}
        >
          <button
            onClick={() => handleStartRename(contextMenu.roomId)}
            className="block w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-100 transition-colors"
          >
            Zmień nazwę
          </button>
          <button
            onClick={() => handleDuplicate(contextMenu.roomId)}
            className="block w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-100 transition-colors"
          >
            Duplikuj
          </button>
          <button
            onClick={() => handleDelete(contextMenu.roomId)}
            className="block w-full text-left px-4 py-2 text-sm text-rose-600 hover:bg-rose-50 transition-colors"
          >
            Usuń
          </button>
          
          <div className="border-t my-1 border-slate-200"></div>
          <div className="px-4 py-1.5 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
            Zmień kolor
          </div>
          <div className="px-4 pb-2.5">
            <div className="grid grid-cols-5 gap-1.5 mb-2.5">
              {PRESET_COLORS.map(color => {
                let bgClass = 'bg-slate-300';
                if (color.value.includes('sky')) bgClass = 'bg-sky-300';
                else if (color.value.includes('emerald')) bgClass = 'bg-emerald-300';
                else if (color.value.includes('amber')) bgClass = 'bg-amber-300';
                else if (color.value.includes('fuchsia')) bgClass = 'bg-fuchsia-300';
                else if (color.value.includes('violet')) bgClass = 'bg-violet-400';
                else if (color.value.includes('cyan')) bgClass = 'bg-cyan-300';
                else if (color.value.includes('indigo')) bgClass = 'bg-indigo-300';
                else if (color.value.includes('teal')) bgClass = 'bg-teal-300';
                else if (color.value.includes('rose')) bgClass = 'bg-rose-300';
                else if (color.value.includes('slate')) bgClass = 'bg-slate-300';

                return (
                  <button
                    key={color.value}
                    title={color.name}
                    type="button"
                    onClick={() => handleChangeColor(contextMenu.roomId, color.value)}
                    className={`w-5.5 h-5.5 rounded-full border border-slate-300/80 cursor-pointer ${bgClass} hover:scale-110 active:scale-95 transition-all shadow-sm`}
                  />
                );
              })}
            </div>
            
            <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-600 hover:text-slate-800 bg-slate-50 hover:bg-slate-100 p-1.5 rounded-lg border border-slate-200/60 transition-colors select-none">
              <input
                type="color"
                value={(() => {
                  const r = rooms.find(room => room.id === contextMenu.roomId);
                  return r && r.color.startsWith('#') ? r.color : '#cbd5e1';
                })()}
                onChange={(e) => handleChangeColor(contextMenu.roomId, e.target.value)}
                className="w-5 h-5 cursor-pointer border-none p-0 bg-transparent rounded shadow-sm shrink-0"
              />
              <span className="font-medium text-[11px] truncate">Kolor niestandardowy...</span>
            </label>
          </div>
          {rooms.find(r => r.id === contextMenu.roomId)?.parts.length > 1 && (
            <>
                <div className="border-t my-1 border-slate-200"></div>
                <button
                    onClick={() => handleRestoreShape(contextMenu.roomId)}
                    className="block w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-100 transition-colors"
                >
                    Przywróć kształt
                </button>
                <button
                    onClick={() => handleSimplifyShape(contextMenu.roomId)}
                    className="block w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-100 transition-colors"
                >
                    Uprość geometrię
                </button>
            </>
          )}
        </div>
      )}
      <div className="absolute bottom-4 right-4 z-10 flex flex-col items-end space-y-2">
        <div className="flex space-x-2">
            <button
                onClick={onUndo}
                disabled={!canUndo}
                className="w-10 h-10 bg-white rounded-full shadow-md flex items-center justify-center text-slate-600 hover:bg-slate-100 font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-white"
                aria-label="Cofnij"
            >
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9h12a5 5 0 0 1 5 5v0a5 5 0 0 1-5 5H7.5"/><path d="m6 12 3-3-3-3"/></svg>
            </button>
            <button
                onClick={onRedo}
                disabled={!canRedo}
                className="w-10 h-10 bg-white rounded-full shadow-md flex items-center justify-center text-slate-600 hover:bg-slate-100 font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-white"
                aria-label="Ponów"
            >
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 9H9a5 5 0 0 0-5 5v0a5 5 0 0 0 5 5h8.5"/><path d="m18 12-3-3 3-3"/></svg>
            </button>
        </div>
        <button
            onClick={toggleFullscreen}
            className="w-10 h-10 bg-white rounded-full shadow-md flex items-center justify-center text-slate-600 hover:bg-slate-100 font-bold transition-all"
            aria-label={isFullscreen ? "Wyjdź z trybu pełnoekranowego" : "Tryb pełnoekranowy"}
        >
            {isFullscreen ? (
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3"/></svg>
            ) : (
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/></svg>
            )}
        </button>
        <button
            onClick={toggleDimensions}
            className={`w-10 h-10 rounded-full shadow-md flex items-center justify-center font-bold transition-all ${
                showDimensions 
                ? 'bg-sky-500 text-white hover:bg-sky-600' 
                : 'bg-white text-slate-600 hover:bg-slate-100'
            }`}
            aria-label={showDimensions ? "Ukryj wymiary" : "Pokaż wymiary"}
        >
           <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 21h18"/><path d="M7 21v-4"/><path d="M17 21v-4"/><path d="M3 7h2"/><path d="M5 3v4"/><path d="M19 7h2"/><path d="M19 3v4"/><path d="M21 15h-2.5l-2.7-3-2.6 3H8.5"/>
            </svg>
        </button>
        <button
            onClick={() => handleZoomButtonClick(true)}
            className="w-10 h-10 bg-white rounded-full shadow-md flex items-center justify-center text-slate-600 hover:bg-slate-100 text-2xl font-bold transition-all"
            aria-label="Przybliż"
        >
            +
        </button>
        <button
            onClick={() => handleZoomButtonClick(false)}
            className="w-10 h-10 bg-white rounded-full shadow-md flex items-center justify-center text-slate-600 hover:bg-slate-100 text-2xl font-bold transition-all"
            aria-label="Oddal"
        >
            -
        </button>
      </div>
    </div>
  );
};