// Home Assistant's rooms (areas) and floors, as the server's hass provider
// sends them, for putting a player in a room.

export const AREAS_COMMAND = "hass/areas";
export const AREAS_SET_PLAYER_COMMAND = "hass/areas/set_player";
export const AREAS_CREATE_COMMAND = "hass/areas/create";

export interface HassFloor {
  floor_id: string;
  name: string;
  level: number | null;
}

export interface HassArea {
  area_id: string;
  name: string;
  floor_id: string | null;
}

export interface AreasReply {
  floors: HassFloor[];
  areas: HassArea[];
  /** Each player's room, or null for none. */
  player_areas: Record<string, string | null>;
}

export interface CreatedArea {
  area_id: string;
  floor_id: string | null;
}

export interface FloorRooms {
  /** null holds the rooms on no floor, or on a floor HA no longer has. */
  floor: HassFloor | null;
  rooms: HassArea[];
}

/**
 * The rooms under their floors, both in Home Assistant's own order, with the
 * rooms on no floor last. Floors without rooms are left out: there is nothing
 * to pick under them.
 */
export function roomsByFloor(reply: AreasReply): FloorRooms[] {
  const known = new Set(reply.floors.map((floor) => floor.floor_id));
  const onFloors = reply.floors
    .map((floor) => ({
      floor,
      rooms: reply.areas.filter((area) => area.floor_id === floor.floor_id),
    }))
    .filter((group) => group.rooms.length > 0);
  const loose = reply.areas.filter(
    (area) => !area.floor_id || !known.has(area.floor_id),
  );
  return loose.length > 0
    ? [...onFloors, { floor: null, rooms: loose }]
    : onFloors;
}
