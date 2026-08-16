export interface AuthenticatedPrincipal {
  subject: string;
}

export interface SessionVerifier {
  authenticate(request: Request): Promise<AuthenticatedPrincipal | null>;
}
