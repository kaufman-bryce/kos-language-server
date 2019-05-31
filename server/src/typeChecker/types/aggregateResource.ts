import { ArgumentType } from './types';
import { createStructureType, createSuffixType } from "../typeCreators";
import { addPrototype, addSuffixes } from '../typeUitlities';
import { structureType } from './primitives/structure';
import { userListType } from './collections/userList';
import { stringType } from './primitives/string';
import { scalarType } from './primitives/scalar';

export const aggregateResourceType: ArgumentType = createStructureType('aggregateResource');
addPrototype(aggregateResourceType, structureType);

addSuffixes(
  aggregateResourceType,
  createSuffixType('name', stringType),
  createSuffixType('density', scalarType),
  createSuffixType('amount', scalarType),
  createSuffixType('capacity', scalarType),
  createSuffixType('part', userListType),
);
