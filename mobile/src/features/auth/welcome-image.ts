import type { ImageSourcePropType } from 'react-native';

/**
 * Login hero photo (full width, cropped to cover). Set to null to show a plain panel instead.
 * Record the image's creator and license in the design handoff's image provenance table.
 */
export const welcomeImage: { source: ImageSourcePropType; alt: string } | null = {
  source: require('../../../assets/images/welcome.jpg'),
  alt: 'A model tooth and dental mirror on a table in a bright clinic.',
};
