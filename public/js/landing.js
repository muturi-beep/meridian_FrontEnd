const hamburger = document.getElementById('hamburger');
    const navLinks = document.getElementById('navLinks');
    const overlay = document.getElementById('menuOverlay');

    function toggleMenu() {
      navLinks.classList.toggle('open');
      overlay.classList.toggle('open');
      hamburger.classList.toggle('active');
      document.body.style.overflow = navLinks.classList.contains('open') ? 'hidden' : '';
    }
    function closeMenu() {
      navLinks.classList.remove('open');
      overlay.classList.remove('open');
      hamburger.classList.remove('active');
      document.body.style.overflow = '';
    }
    hamburger.addEventListener('click', e => { e.stopPropagation(); toggleMenu(); });
    overlay.addEventListener('click', closeMenu);

    // ── Active nav link ──
    const navItems = document.querySelectorAll('.nav-links a:not(.nav-btn)');
    function updateActiveLink(clicked) {
      navItems.forEach(l => l.classList.remove('active'));
      if (clicked) clicked.classList.add('active');
    }
    document.querySelectorAll('.nav-links a').forEach(link => {
      link.addEventListener('click', function(e) {
        if (window.innerWidth <= 768) closeMenu();
        if (!this.classList.contains('nav-btn')) updateActiveLink(this);
      });
    });
    const homeLink = document.querySelector('.nav-links a[href="#home"]');
    if (homeLink) homeLink.classList.add('active');
    window.addEventListener('resize', () => { if (window.innerWidth > 768 && navLinks.classList.contains('open')) closeMenu(); });

    // ── Scroll to Top ──
    const scrollBtn = document.getElementById('scrollTopBtn');
    window.addEventListener('scroll', () => {
      scrollBtn.classList.toggle('visible', window.scrollY > 400);
    });
    scrollBtn.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));

    // ── Contact Form ──
    function handleContactForm(e) {
      e.preventDefault();
      const feedback = document.getElementById('formFeedback');
      feedback.className = 'success';
      feedback.textContent = '✅ Your message has been sent! We\'ll get back to you soon.';
      document.getElementById('contactForm').reset();
      setTimeout(() => { feedback.className = ''; feedback.textContent = ''; }, 5000);
    }

    // ── Hero Carousel ──
    (function() {
      // ✅ Images are located in public/images/ – this relative path works perfectly.
      const localImages = [
        'images/ca1.jpg',
        'images/ca2.jpg',
        'images/ca3.jpg',
        'images/ca4.jpg',
        'images/ca5.jpg'
      ];
      const fallbackEmojis = ['🏢','🏙️','🏠','🌆','🌇'];
      const slidesContainer = document.getElementById('carouselSlides');
      const dotsContainer = document.getElementById('carouselDots');
      const prevBtn = document.getElementById('carouselPrev');
      const nextBtn = document.getElementById('carouselNext');
      let currentIndex = 0, autoSlideInterval = null;
      const autoSlideDelay = 5000;

      function buildSlides() {
        slidesContainer.innerHTML = '';
        dotsContainer.innerHTML = '';
        localImages.forEach((src, index) => {
          const slide = document.createElement('div');
          slide.className = 'slide';
          slide.dataset.index = index;
          const img = document.createElement('img');
          img.src = src;
          img.alt = `Property image ${index + 1}`;
          img.loading = 'lazy';
          img.onerror = function() {
            this.style.display = 'none';
            const fallback = document.createElement('span');
            fallback.className = 'fallback-icon';
            fallback.textContent = fallbackEmojis[index % fallbackEmojis.length];
            slide.appendChild(fallback);
          };
          slide.appendChild(img);
          slidesContainer.appendChild(slide);
          const dot = document.createElement('button');
          dot.className = 'dot' + (index === 0 ? ' active' : '');
          dot.dataset.index = index;
          dot.setAttribute('aria-label', `Go to slide ${index + 1}`);
          dot.addEventListener('click', function() { goToSlide(parseInt(this.dataset.index)); });
          dotsContainer.appendChild(dot);
        });
      }

      function goToSlide(index) {
        const slides = slidesContainer.querySelectorAll('.slide');
        const dots = dotsContainer.querySelectorAll('.dot');
        if (index < 0) index = slides.length - 1;
        if (index >= slides.length) index = 0;
        currentIndex = index;
        slidesContainer.style.transform = `translateX(-${currentIndex * 100}%)`;
        dots.forEach((dot, i) => dot.classList.toggle('active', i === currentIndex));
        resetAutoSlide();
      }

      function nextSlide() { goToSlide(currentIndex + 1); }
      function prevSlide() { goToSlide(currentIndex - 1); }

      function resetAutoSlide() {
        if (autoSlideInterval) clearInterval(autoSlideInterval);
        autoSlideInterval = null;
        if (window.innerWidth > 480) autoSlideInterval = setInterval(nextSlide, autoSlideDelay);
      }

      let touchStartX = 0, touchEndX = 0;
      function handleTouchStart(e) { touchStartX = e.changedTouches[0].screenX; }
      function handleTouchEnd(e) {
        touchEndX = e.changedTouches[0].screenX;
        const diff = touchStartX - touchEndX;
        if (Math.abs(diff) > 50) { diff > 0 ? nextSlide() : prevSlide(); }
      }

      function initCarousel() {
        buildSlides();
        slidesContainer.style.transform = 'translateX(0%)';
        nextBtn.addEventListener('click', e => { e.stopPropagation(); nextSlide(); });
        prevBtn.addEventListener('click', e => { e.stopPropagation(); prevSlide(); });
        const carousel = document.getElementById('heroCarousel');
        carousel.addEventListener('touchstart', handleTouchStart, { passive: true });
        carousel.addEventListener('touchend', handleTouchEnd, { passive: true });
        carousel.setAttribute('role', 'region');
        carousel.setAttribute('aria-label', 'Property image carousel');
        resetAutoSlide();
        carousel.addEventListener('mouseenter', () => { if (autoSlideInterval) { clearInterval(autoSlideInterval); autoSlideInterval = null; } });
        carousel.addEventListener('mouseleave', resetAutoSlide);
        window.addEventListener('resize', resetAutoSlide);
      }
      if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initCarousel);
      else initCarousel();
    })();