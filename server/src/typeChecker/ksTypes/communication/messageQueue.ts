import { createType, createArgSuffixType, noMap } from '../../utilities/typeCreators';
import { structureType } from '../primitives/structure';

import { messageType } from './message';
import { noneType } from '../primitives/none';
import { booleanType } from '../primitives/boolean';
import { scalarType } from '../primitives/scalar';

export const messageQueueType = createType('messageQueue');
messageQueueType.addSuper(noMap(structureType));

messageQueueType.addSuffixes(
  noMap(createArgSuffixType('empty', booleanType)),
  noMap(createArgSuffixType('length', scalarType)),
  noMap(createArgSuffixType('pop', messageType)),
  noMap(createArgSuffixType('peek', messageType)),
  noMap(createArgSuffixType('clear', noneType)),
  noMap(createArgSuffixType('push', noneType, structureType)),
);
