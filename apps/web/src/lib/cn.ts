import { clsx, type ClassValue } from "clsx";

/** Tiny className combinator used by every component in the library. */
export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}
