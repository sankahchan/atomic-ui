import { router, adminProcedure } from '../trpc';
import { getOnboardingReadiness } from '@/lib/services/onboarding';

export const onboardingRouter = router({
  status: adminProcedure.query(async () => getOnboardingReadiness()),
});
