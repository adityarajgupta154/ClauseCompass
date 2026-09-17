import { useSyncExternalStore } from "react";
import { getDisplay, subscribeDisplay, type DisplaySettings } from "./display-store";

/** The current display settings; the component re-renders when either changes. */
export function useDisplay(): DisplaySettings {
  return useSyncExternalStore(subscribeDisplay, getDisplay, getDisplay);
}
