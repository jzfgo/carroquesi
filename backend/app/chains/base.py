from collections.abc import Callable
from dataclasses import dataclass, field

from app.schemas.chains import DecodedLabel
from app.services.store_key import store_key

LabelDecoder = Callable[[str], DecodedLabel | None]


@dataclass(frozen=True)
class ChainProfile:
    # The raw store string a chain feature writes onto an item. It goes
    # through the store registry like a typed name and never overrides a
    # list's display name.
    name: str
    # Store spellings that belong to this chain, beyond the key of `name`.
    # Grouping is for chain features only; price histories stay per key.
    extra_store_keys: tuple[str, ...] = ()
    # Lowercase, trimmed: the form a typed brand is compared in.
    own_brands: tuple[str, ...] = ()
    decoders: tuple[LabelDecoder, ...] = field(default=(), repr=False)
    # Whether one of the decoders returns a weight. Clients offer the weighed
    # label scan only then; a price-only label has nothing to weigh.
    reads_label_weight: bool = False

    @property
    def store_keys(self) -> tuple[str, ...]:
        return (store_key(self.name), *self.extra_store_keys)

    def decode_label(self, digits: str) -> DecodedLabel | None:
        """The first of this chain's decoders that accepts the digits."""
        for decoder in self.decoders:
            decoded = decoder(digits)
            if decoded is not None:
                return decoded
        return None
