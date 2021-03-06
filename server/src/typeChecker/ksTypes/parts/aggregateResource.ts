import { createType, createSuffixType, noMap } from '../../utilities/typeCreators';
import { structureType } from '../primitives/structure';
import { stringType } from '../primitives/string';
import { scalarType } from '../primitives/scalar';
import { listType } from '../collections/list';
import { partType } from './part';

export const aggregateResourceType = createType('aggregateResource');
aggregateResourceType.addSuper(noMap(structureType));

aggregateResourceType.addSuffixes(
  noMap(createSuffixType('name', stringType)),
  noMap(createSuffixType('density', scalarType)),
  noMap(createSuffixType('amount', scalarType)),
  noMap(createSuffixType('capacity', scalarType)),
  noMap(createSuffixType('parts', listType.apply(partType))),
);
