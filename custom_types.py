import pydantic


class RAGChunkAndSrc(pydantic.BaseModel):
    chunks: list[str]
    source_id: str = None
    # Images aligned to chunks: each entry is a list of image URLs for the corresponding chunk
    images: list[list[str]] = pydantic.Field(default_factory=list)
    guide_title: str | None = None
    guide_url: str | None = None


class RAGUpsertResult(pydantic.BaseModel):
    ingested: int


class RAGSearchResult(pydantic.BaseModel):
    contexts: list[str]
    sources: list[str]
    guide_ids: list[int] = pydantic.Field(default_factory=list)
    images_per_context: list[list[str]] = pydantic.Field(default_factory=list)
    guide_info: list[dict] = pydantic.Field(default_factory=list)


class RAQQueryResult(pydantic.BaseModel):
    answer: str
    sources: list[str]
    num_contexts: int
    source_guides: list[dict] = pydantic.Field(default_factory=list)
    images: list[str] = pydantic.Field(default_factory=list)
