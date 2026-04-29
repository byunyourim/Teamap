const USER_KEY = 'teamap_username';

export function getUsername(): string {
  return localStorage.getItem(USER_KEY) ?? '';
}

export function setUsername(name: string) {
  localStorage.setItem(USER_KEY, name);
}
