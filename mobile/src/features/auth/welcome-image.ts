import type { ImageSourcePropType } from 'react-native';

/**
 * Welcome hero image. Until it is set, Welcome shows an empty framed slot of the same size.
 * To add it: put the licensed file in mobile/assets/images/ and set, for example,
 *   export const welcomeImage = { source: require('../../../assets/images/welcome.jpg'), alt: 'A calm, empty dental treatment room in soft daylight.' };
 * and record its creator and license in the design handoff's image provenance table.
 */
export const welcomeImage: { source: ImageSourcePropType; alt: string } | null = null;
