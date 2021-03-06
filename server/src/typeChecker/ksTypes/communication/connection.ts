import {
  createType,
  createArgSuffixType,
  createSuffixType,
  noMap,
} from '../../utilities/typeCreators';
import { structureType } from '../primitives/structure';
import { booleanType } from '../primitives/boolean';
import { scalarType } from '../primitives/scalar';

export const connectionType = createType('connection');
connectionType.addSuper(noMap(structureType));

connectionType.addSuffixes(
  noMap(createSuffixType('isConnected', booleanType)),
  noMap(createSuffixType('delay', scalarType)),
  noMap(createArgSuffixType('sendMessage', booleanType, structureType)),
  noMap(createArgSuffixType('destination', structureType)),
);
