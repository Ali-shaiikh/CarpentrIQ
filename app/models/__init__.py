"""Import all models so Alembic autogenerate detects every table."""

from app.models.carpenter import Carpenter  # noqa: F401
from app.models.enquiry import CVResult, Enquiry, EnquiryPhoto  # noqa: F401
from app.models.material import FurnitureCatalogue, Job, MaterialPrice  # noqa: F401
from app.models.payment import Payment  # noqa: F401
from app.models.quote import FurnitureItem, Quote  # noqa: F401
from app.models.subscription import SubscriptionHistory, UsageLog  # noqa: F401
from app.models.portfolio import CarpenterPortfolio, CarpenterReview  # noqa: F401
from app.models.homeowner import Homeowner  # noqa: F401
from app.models.saved_design import SavedDesign  # noqa: F401
