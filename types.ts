
export interface Rectangle {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Room {
  id:string;
  name: string;
  targetArea: number;
  color: string;
  parts: Rectangle[];
}
