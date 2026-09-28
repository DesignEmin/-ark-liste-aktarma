// MusicKit JS v3 için kullandığımız küçük bir tip alt kümesi.
// https://js-cdn.music.apple.com/musickit/v3/docs/

declare namespace MusicKit {
  interface Configuration {
    developerToken: string;
    app: { name: string; build: string; icon?: string };
  }
  interface MusicKitInstance {
    authorize(): Promise<string>;
    unauthorize(): Promise<void>;
    isAuthorized: boolean;
    musicUserToken: string;
  }
  function configure(config: Configuration): Promise<MusicKitInstance>;
  function getInstance(): MusicKitInstance;
}

interface Window {
  MusicKit?: typeof MusicKit;
}
