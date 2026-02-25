export interface JwtPayload {
  id: string;
  username?: string | null | undefined;
  role?: string | null | undefined;
  search_engine?: string | null | undefined;
  iat?: number | undefined;
  exp?: number | undefined;
}

export interface Tokens {
  accessToken: string;
  refreshToken?: string;
}
