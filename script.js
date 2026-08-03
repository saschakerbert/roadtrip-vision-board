const stops = document.querySelectorAll('.stop');
const dots = document.querySelectorAll('.dot');
const sections = document.querySelectorAll('section, header');

const io = new IntersectionObserver((entries) => {
  entries.forEach((entry) => {
    if (entry.isIntersecting) entry.target.classList.add('in-view');
  });
}, { threshold: 0.25 });

stops.forEach((stop) => io.observe(stop));

const navIo = new IntersectionObserver((entries) => {
  entries.forEach((entry) => {
    if (entry.isIntersecting) {
      const id = entry.target.id;
      dots.forEach((dot) => {
        dot.classList.toggle('active', dot.getAttribute('href') === `#${id}`);
      });
    }
  });
}, { threshold: 0.5 });

sections.forEach((section) => navIo.observe(section));
