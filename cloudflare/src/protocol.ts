export interface NoteChange {
  sequence: number;
  path: string;
  revision: number;
  modifiedAt: string;
  deleted: boolean;
  content?: string;
}

export interface ChangesResponse {
  cursor: number;
  changes: NoteChange[];
}

export interface PutNoteRequest {
  baseRevision: number;
  content: string;
  modifiedAt: string;
  idempotencyKey: string;
}

export interface NoteResponse {
  path: string;
  revision: number;
  modifiedAt: string;
  deleted: boolean;
  content?: string;
}

export interface CreateSpaceResponse {
  spaceId: string;
  token: string;
}
