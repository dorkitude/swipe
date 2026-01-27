/**
 * Global registry to map room codes to room IDs
 * Used for the room code lookup API endpoint
 */
class RoomCodeRegistry {
  private codeToRoomId: Map<string, string> = new Map();
  private roomIdToCode: Map<string, string> = new Map();

  register(roomCode: string, roomId: string): void {
    this.codeToRoomId.set(roomCode, roomId);
    this.roomIdToCode.set(roomId, roomCode);
    console.log(`[RoomCodeRegistry] Registered: ${roomCode} -> ${roomId}`);
  }

  unregister(roomId: string): void {
    const code = this.roomIdToCode.get(roomId);
    if (code) {
      this.codeToRoomId.delete(code);
      this.roomIdToCode.delete(roomId);
      console.log(`[RoomCodeRegistry] Unregistered: ${code}`);
    }
  }

  getRoomId(roomCode: string): string | undefined {
    return this.codeToRoomId.get(roomCode);
  }

  getCode(roomId: string): string | undefined {
    return this.roomIdToCode.get(roomId);
  }
}

export const roomCodeRegistry = new RoomCodeRegistry();
