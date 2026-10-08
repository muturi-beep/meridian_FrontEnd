## Known cleanup

- Unit model still has both `propertyId` (ObjectId) and `property` (String).
  `propertyId` is authoritative — `property` is legacy and unused by reads.
  See "E-5" in project history for the removal plan if we ever need it.
